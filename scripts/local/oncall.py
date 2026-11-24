"""Run real on-call Workflows with the upstream offline model and invoker."""


def apply(services, spec, root, apps, port):
    if 'agentcore-research' not in apps:
        return
    common = {
        'TEMPORAL_ADDRESS': 'temporal:7233', 'TEMPORAL_NAMESPACE': 'default',
        'TEMPORAL_TASK_QUEUE': 'ri26-oncall', 'TEMPORAL_DEPLOYMENT_NAME': 'ri26-oncall',
        'TEMPORAL_WORKER_BUILD_ID': 'local-1', 'TEMPORAL_API_KEY': '', 'TEMPORAL_TLS': 'false',
        'AWS_ACCESS_KEY_ID': '', 'AWS_SECRET_ACCESS_KEY': '', 'AWS_SESSION_TOKEN': '',
        'AWS_EC2_METADATA_DISABLED': 'true',
    }
    def build(name, target=None):
        recipe = spec['builds'][name]
        value = {'context': str(root / recipe['context']), 'dockerfile': str(root / recipe['dockerfile'])}
        if target:
            value['target'] = target
        return value
    depends = {'temporal-init': {'condition': 'service_completed_successfully'}}
    services['oncall-api'] = {
        'build': build('oncall-api'), 'environment': {
            **common, 'TEMPORAL_UI_URL': f'http://localhost:{port}/_temporal/primary',
            'TEMPORAL_UI_NAMESPACE': 'default', 'WORKER_LOCATION': 'local',
        }, 'depends_on': depends,
    }
    services['oncall-agent'] = {
        'build': build('oncall-agent', 'runtime'), 'environment': {
            **common, 'AGENT_MODEL': 'stub', 'BEDROCK_MODEL_ID': '',
            'AGENTCORE_DEBOUNCE_SECONDS': '10',
        }, 'depends_on': depends,
    }
    services['oncall-invoker'] = {
        'build': build('oncall-api', 'local-invoker'),
        'environment': {**common, 'AGENT_INVOKE_URL': 'http://oncall-agent:8080/invocations'},
        'depends_on': {**depends, 'oncall-agent': {'condition': 'service_started'}},
    }
