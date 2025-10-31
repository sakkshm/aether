import { env } from '@xenova/transformers'

// Run everything in the current context (no extra workers)
env.allowWebWorkers = false

// Force single-threaded ORT WASM (avoid blob worker in MV3 SW)
env.backends.onnx.wasm.numThreads = 1
env.backends.onnx.wasm.proxy = false

// If you want to use CDN-hosted WASM files:
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/'

// Cache remotely-fetched files via Cache API
env.allowRemoteModels = true
env.allowLocalModels = false
env.useBrowserCache = true
