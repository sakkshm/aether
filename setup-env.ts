// setup-env.ts
import { env } from '@xenova/transformers'

console.log("Configuring Transformers.js for Chrome Extension...");

// Cast to 'any' to allow setting these properties
const tsEnv = env as any;

// Run everything in the current context (no extra workers)
tsEnv.allowWebWorkers = false

// Force single-threaded ORT WASM (avoid blob worker in MV3 SW)
tsEnv.backends.onnx.wasm.numThreads = 1
tsEnv.backends.onnx.wasm.proxy = false

// If you want to use CDN-hosted WASM files:
tsEnv.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/'

// Cache remotely-fetched files via Cache API
tsEnv.allowRemoteModels = true
tsEnv.allowLocalModels = false
tsEnv.useBrowserCache = true

console.log("✅ Configured:", {
  allowWebWorkers: tsEnv.allowWebWorkers,
  wasm: tsEnv.backends.onnx.wasm.wasmPaths,
  remoteModels: true,
  browserCache: true
});