import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ApiError,requiresEmailAtCapture} from '../src/shared/httpError.ts'

test('old API missing-email validation activates capture-first compatibility',()=>{
 const error=new ApiError(422,{detail:[{type:'missing',loc:['body','email'],msg:'Field required',input:{image:'data:image/jpeg;base64,PRIVATE_PHOTO'}}]})
 assert.equal(requiresEmailAtCapture(error),true)
 assert.deepEqual(error.issues,[{field:'body.email',type:'missing'}])
 assert.ok(!JSON.stringify(error).includes('PRIVATE_PHOTO'))
 assert.ok(!String(error).includes('PRIVATE_PHOTO'))
})
test('other validation and server failures never masquerade as an older API',()=>{
 for(const [status,payload] of [[422,{detail:[{type:'missing',loc:['body','image']}]}],[422,{detail:[{type:'invalid',loc:['body','email']}]}],[500,{detail:'internal error'}],[413,null]])assert.equal(requiresEmailAtCapture(new ApiError(status,payload)),false)
})
test('error display remains short for huge validation responses or HTML bodies',()=>{
 for(const payload of [{detail:[{type:'missing',loc:['body','email'],input:{image:'A'.repeat(2_000_000)}}]},'<html>server error</html>',null]){
  const error=new ApiError(422,payload)
  assert.ok(error.message.length<80)
  assert.ok(JSON.stringify(error).length<300)
 }
})
