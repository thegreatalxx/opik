Agent Configs Client
====================

The Agent Configs client provides methods for managing agent configurations in the Opik platform.

.. autoclass:: opik.rest_api.agent_configs.client.AgentConfigsClient
   :members:
   :undoc-members:
   :show-inheritance:
   :inherited-members:
   :exclude-members: with_raw_response

Usage Example
-------------

.. code-block:: python

   import opik

   client = opik.Opik()

   # Access the agent configs REST client
   agent_configs_client = client.rest_client.agent_configs
