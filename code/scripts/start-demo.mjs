import { createDemoApp } from '../apps/api/dist/main.js';
const port=Number(process.env.PORT??3000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const app=await createDemoApp();await app.listen(port,'127.0.0.1');
console.info(`Explicit offline fixture demo: http://127.0.0.1:${port}/api/demo/health`);
