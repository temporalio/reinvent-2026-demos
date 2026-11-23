# Cornelia Davis’s AgentCore demo

The silent MP4 is packaged by the existing Launchpad build at `apps/launchpad/public/agentcore-video/CD_AgentCoreDemo.mp4`, copied from the supplied `apps/AgentCoreDemoVideo/CD_AgentCoreDemo.mp4`. It has no audio stream. No extra component or AWS resource is required in the single Fieldkit YAML.

The card appears only in AI/AWS. Playback fills the station rectangle. Playing video suspends idle navigation; pause/end resumes the 60-second idle window. Booth Control can disable the card globally or per station.
