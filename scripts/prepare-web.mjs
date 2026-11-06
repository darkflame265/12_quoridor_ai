import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('public/models',{recursive:true});await mkdir('public/runtime',{recursive:true});
await copyFile('vendor/sigma-quoridor/models/best.onnx','public/models/best.onnx');
await copyFile('vendor/onnxruntime/LICENSE','public/runtime/LICENSE.txt');
await copyFile('vendor/sigma-quoridor/LICENSE','public/models/LICENSE.txt');
