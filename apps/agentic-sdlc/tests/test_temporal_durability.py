"""Offline compatibility checks for the TemporalAgent capability migration."""
from __future__ import annotations

from datetime import timedelta
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import warnings

from pydantic_ai import Agent
from pydantic_ai.durable_exec.temporal import AgentPlugin, TemporalAgent, TemporalDurability
from pydantic_ai.exceptions import PydanticAIDeprecationWarning
from pydantic_ai.models.test import TestModel
from temporalio import activity

from agentic_sdlc.agents import harness_ext
from agentic_sdlc.agents.tools import READ_ONLY_TOOLS


class TemporalDurabilityCompatibilityTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        # Load a separate module so this test never constructs provider clients or
        # changes the runtime module other tests may already have imported.
        name = 'agentic_sdlc.agents._durability_compatibility_runtime'
        source = Path(__file__).parents[1] / 'agentic_sdlc/agents/runtime.py'
        spec = importlib.util.spec_from_file_location(name, source)
        cls.runtime = importlib.util.module_from_spec(spec)
        sys.modules[name] = cls.runtime
        cls.addClassCleanup(sys.modules.pop, name, None)
        model = TestModel(call_tools=[], custom_output_text='offline compatibility result')
        cls.models = {'test:offline': model}
        with patch('agentic_sdlc.agents.registry.build_registry', return_value=cls.models):
            with warnings.catch_warnings():
                warnings.simplefilter('error', PydanticAIDeprecationWarning)
                spec.loader.exec_module(cls.runtime)

    def test_agent_names_registry_and_stream_handler_are_preserved(self):
        self.assertEqual([agent.name for agent in self.runtime.ALL_AGENTS],
                         ['planner', 'coder', 'reviewer', 'security-reviewer'])
        self.assertEqual(self.runtime.MODELS, self.models)
        for agent in self.runtime.ALL_AGENTS:
            self.assertIsInstance(agent, Agent)
            durability = TemporalDurability.from_agent(agent)
            self.assertIsNotNone(durability)
            self.assertIs(durability._event_stream_handler, harness_ext.event_stream_handler)
            self.assertIs(durability._models_by_id['test:offline'], self.models['test:offline'])
            # Registration is the same plugin call used by the existing worker.
            self.assertIsInstance(AgentPlugin(agent), AgentPlugin)

    def test_model_heartbeat_and_retry_policy_are_preserved(self):
        for agent in self.runtime.ALL_AGENTS:
            config = TemporalDurability.from_agent(agent)._model_activity_config
            self.assertEqual(config['heartbeat_timeout'], timedelta(seconds=10))
            self.assertEqual(config['start_to_close_timeout'], timedelta(minutes=10))
            self.assertEqual(config['schedule_to_close_timeout'], timedelta(minutes=30))
            retry = config['retry_policy']
            self.assertEqual(retry.initial_interval, timedelta(seconds=2))
            self.assertEqual(retry.maximum_interval, timedelta(seconds=30))
            self.assertEqual(retry.backoff_coefficient, 2)
            self.assertIn('ProviderRejected', retry.non_retryable_error_types)

    def test_tool_dispatch_remains_in_workflow_and_keeps_toolset_ids(self):
        for agent in self.runtime.ALL_AGENTS:
            # These async adapters perform harness approval/dispatch. Their actual
            # I/O is already in harness Activities and must not gain another wrapper.
            toolset = next(toolset for toolset in agent.toolsets if toolset.id == f'{agent.name}-tools')
            for tool in toolset.tools.values():
                self.assertIs(tool.metadata['temporal'], False)
                self.assertTrue(tool.function_schema.is_async)

    def test_legacy_activity_names_remain_registered(self):
        toolset, config = harness_ext.workspace_toolset(READ_ONLY_TOOLS, id='planner-tools')
        # Compare against the old API intentionally; only this fixture emits the warning.
        with warnings.catch_warnings(record=True):
            warnings.simplefilter('always', PydanticAIDeprecationWarning)
            legacy = TemporalAgent(
                Agent(self.models['test:offline'], instructions=self.runtime.PLANNER_INSTRUCTIONS,
                      output_type=self.runtime.Plan, deps_type=harness_ext.DemoDeps, toolsets=[toolset]),
                name='planner', models=self.models,
                event_stream_handler=harness_ext.event_stream_handler,
                model_activity_config=self.runtime.MODEL_ACTIVITY,
                tool_activity_config=config,
            )
        old_names = {activity._Definition.must_from_callable(fn).name for fn in legacy.temporal_activities}
        new_names = {activity._Definition.must_from_callable(fn).name
                     for fn in TemporalDurability.from_agent(self.runtime.PLANNER).temporal_activities}
        self.assertTrue(old_names <= new_names, old_names - new_names)

    async def test_capability_runs_a_synthetic_model_without_provider_access(self):
        agent = self.runtime._agent('offline-check', instructions='Return the result.', output_type=str, tools=[])
        result = await agent.run('Check compatibility.', deps=harness_ext.DemoDeps(), model='test:offline')
        self.assertEqual(result.output, 'offline compatibility result')


if __name__ == '__main__':
    unittest.main()
