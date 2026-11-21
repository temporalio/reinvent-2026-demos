const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { Client, Connection } = require('@temporalio/client');
const { ApplicationFailure } = require('@temporalio/common');
const { NativeConnection, Worker } = require('@temporalio/worker');
const { temporalSettings } = require('../lib/connection-options');

test('explicit environment controls the worker connection', () => {
  assert.deepEqual(temporalSettings({}), {address:'localhost:7233',namespace:'default',taskQueue:'dejavu-tacos',tls:false,apiKey:undefined});
  assert.deepEqual(temporalSettings({TEMPORAL_ADDRESS:'example:7233',TEMPORAL_NAMESPACE:'station',TEMPORAL_TASK_QUEUE:'orders',TEMPORAL_API_KEY:'synthetic-key'}), {address:'example:7233',namespace:'station',taskQueue:'orders',tls:true,apiKey:'synthetic-key'});
  assert.equal(temporalSettings({TEMPORAL_TLS:'false'}).tls,false);
  assert.throws(()=>temporalSettings({TEMPORAL_TLS:'false',TEMPORAL_API_KEY:'synthetic-key'}),/TLS/);
});

for (const scenario of ['happy','compensation']) {
  test(`real Temporal execution: ${scenario}`, {timeout:90000}, async () => {
    const address=process.env.TEMPORAL_TEST_ADDRESS || 'localhost:7233';
    const namespace=process.env.TEMPORAL_TEST_NAMESPACE || 'default';
    const taskQueue=`sdk-compat-${randomUUID()}`;
    const native=await NativeConnection.connect({address});
    const connection=await Connection.connect({address});
    const client=new Client({connection,namespace});
    const calls=[];
    const activities={
      validateOrder:async()=>{calls.push('validate');return {valid:true}},
      validateStore:async()=>({store_id:'synthetic-store'}),
      authorizePayment:async()=>{calls.push('hold');return {authorization_id:'synthetic-hold',amount:5,status:'authorized'}},
      clearCart:async()=>{if(scenario==='compensation')throw ApplicationFailure.nonRetryable('Synthetic cart failure');return {}},
      submitToStore:async()=>({submitted:true}),
      capturePayment:async input=>{assert.equal(input.authorization_id,'synthetic-hold');calls.push('capture');return {}},
      releasePaymentHold:async input=>{assert.equal(input.authorization_id,'synthetic-hold');calls.push('release');return {}},
      notifyCustomer:async input=>{calls.push(input.success?'notify-success':'notify-failure');return {}},
    };
    try {
      const worker=await Worker.create({connection:native,namespace,taskQueue,workflowsPath:require.resolve('../lib/workflows'),activities});
      await worker.runUntil(async()=>{
        const handle=await client.workflow.start('OrderWorkflow',{workflowId:`compat-${randomUUID()}`,taskQueue,args:[{order_id:'synthetic-order',items:[{price:5,quantity:1}],total:5}]});
        if(scenario==='happy')await handle.signal('order_ready');
        const result=await handle.result();
        assert.equal(result.success,scenario==='happy');
        assert.equal((await handle.describe()).status.name,'COMPLETED');
      });
      assert.deepEqual(calls,scenario==='happy'?['validate','hold','capture','notify-success']:['validate','hold','release','notify-failure']);
    } finally {await connection.close();await native.close()}
  });
}
