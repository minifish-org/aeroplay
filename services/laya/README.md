# Optional Laya decision service

AeroPlay's human game modes and bundled assets remain independent of this service. Without a configured service URL, no background Laya requests are made. Connection checks run for a configured address while online, or when a player tests an address; decision requests run only in Watch Laya mode. Configure one URL for the whole arcade; individual game adapters provide their own observations, questions, and legal choices.

This service reads those observations with the pinned Laya model. The GMK deployment uses Laya Q8_0 through llama.cpp's Vulkan backend. It does not inspect hidden game answers, solve games on the server, replace a model answer with a rule, or promise that Laya can complete every game. Invalid choices, over-budget observations, busy inference, and connection failures produce explicit errors.

## API

`GET /health` is cheap and remains available while inference is busy:

```json
{
  "ready": true,
  "model": "Laya Q8",
  "revision": "22265007700297ba9e128297e82540cf28c5d7d4",
  "protocol": "aeroplay-laya-v1",
  "games": ["sky", "cargo", "snake", "tetris", "2048", "flappy", "maze", "match3", "sudoku", "lightsout"],
  "runtime": "llama.cpp b11552",
  "quantization": "Q8_0",
  "device": "vulkan",
  "threads": 4
}
```

The game list declares accepted adapter IDs, not measured completion rates. The API starts after warming the model; later health checks consult the inference service and report `ready: false` while it is unavailable. The optional PyTorch backend reports its own CPU model and revision instead.

`POST /decision` accepts `Content-Type: application/json`:

```json
{
  "game": "sky",
  "context": "The golden ring is in the right lane. The middle lane has a barrier.",
  "question": {
    "type": "choice",
    "instructions": "Which lane contains the golden ring?",
    "criteria": {"0": "left", "1": "middle", "2": "right"}
  }
}
```

The result contains `choice`, `latency_ms`, and `model`. The choice key must belong to the supplied criteria. A failure contains `{ "error": "..." }`, with a non-success HTTP status.

Bounds: 16 KiB body, 6,000 context characters, 600 instruction characters, 1–16 options, 64-character keys, and 400-character option descriptions. The native runtime has a 1,024-token context and one slot; keep observations and options short. Native input-budget errors return 422. PyTorch additionally checks its 512-token question head and rejects truncation. Only one inference runs at a time; another decision returns 429 rather than waiting in an unbounded queue. Native calls time out after five seconds. At most 16 HTTP handlers run, and incomplete body reads time out after five seconds.

This API does not expose confidence values or use a confidence threshold. The legacy PyTorch checkpoint's calibration for 11 or more choices falls outside the SDK's accepted range and is clamped by Laya 0.3.22.

## Browser access and deployment boundary

The default CORS allowlist contains exactly:

- `https://games.minifish.org`
- `http://localhost:5173` and `http://127.0.0.1:5173`
- `http://localhost:4173` and `http://127.0.0.1:4173`
- `http://localhost:5191` and `http://127.0.0.1:5191`

Set `LAYA_ALLOWED_ORIGINS` to a comma-separated list of exact HTTP(S) origins to replace that list. Wildcards are rejected. Cloudflare preview and `pages.dev` origins are not allowed by default. The service implements `OPTIONS`, allows only `Content-Type` as a browser request header, and supports authorized private-network preflights. It does not require or send browser credentials. Requests carrying an unlisted Origin return 403. Command-line requests without Origin remain available for administration.

CORS is not authentication. Keep an unauthenticated instance bound to loopback behind a private access boundary such as Tailscale Serve. Public visitors can play human modes without access to that network. Do not expose this service on the public internet without adding an authenticated gateway, rate limits, and an appropriate allowed-origin policy.

Cloudflare builds and serves the static frontend. It does not run this Python service. Service settings are stored on each player's device.

## Build and run

### Native Q8 with Vulkan

`compose.yaml` keeps inference on a private Docker network and exposes only the bounded API at host loopback port 18771. GPU inference receives four CPU threads, a four-CPU quota, a 4 GiB memory limit and the render-device group. The API has a separate 256 MiB limit. Both services run as the runtime image's unprivileged user with read-only files, dropped capabilities, bounded process counts and automatic restart. Models and runtime libraries are mounted read-only; only `shader-cache/` is writable.

Provide this layout beside the Compose file:

```text
models/Laya-Q8_0.gguf
runtime/llama-server
runtime/libggml-vulkan.so
runtime/...                 # All files from the pinned Vulkan archive
shader-cache/               # Writable by the runtime UID
```

Pinned artifacts:

| Artifact | Source | SHA-256 |
| --- | --- | --- |
| Laya Q8_0 | [GGUF revision](https://huggingface.co/ggml-org/Laya-GGUF/resolve/22265007700297ba9e128297e82540cf28c5d7d4/Laya-Q8_0.gguf) | `c06528c5746d3bb8baa72a27938be95abbfd0b226f8471e8a9e365ed0bb066d2` |
| Vulkan runtime | [llama.cpp b11552](https://github.com/ggml-org/llama.cpp/releases/download/b11552/llama-b11552-bin-ubuntu-vulkan-x64.tar.gz) | `c7bb933f3584b73296fbadea6e0d6273ddb7907699ec59ef08d0bb59e0a8b997` |

The runtime source commit is `23b0202a189c44a54625aadcb37a946dd1d6278d`. Verify these hashes before extracting or running the artifacts. Compose requires a local Linux Vulkan image with Python 3, Mesa, Vulkan and the binary's shared-library dependencies. GMK reuses its tested `local-ai-runtime-vulkan:0.2.2` image, pinned by image ID in its ignored `.env`; Compose is not a downloadable standalone runtime image. Set `LAYA_RUNTIME_IMAGE` for another compatible image and `LAYA_RENDER_GID` to the host render group ID. A missing Vulkan device is a startup failure, not an automatic CPU fallback.

```sh
docker compose config --quiet
docker compose up -d --wait
curl -fsS http://127.0.0.1:18771/health
```

The Python adapter uses only the standard library in native mode. `--backend llama-cpp` forwards the original state and question to `/v1/systemone`, requires the configured Laya model filename, validates the returned legal choice and preserves CORS, body bounds and explicit errors. It never exposes the raw inference endpoint to browsers. `LAYA_NATIVE_URL` is the private inference origin.

### Optional PyTorch CPU runtime

The Dockerfile provides a standalone CPU image with Laya 0.3.22, PyTorch 2.7.1+cpu, and Transformers 4.51.3. From this directory:

```sh
docker build -t aeroplay-laya:0.1 .
mkdir -p cache
docker run --rm --cpus 4 --memory 6g --pids-limit 256 \
  -v "$PWD/cache:/cache" aeroplay-laya:0.1 --prepare
docker run -d --name aeroplay-laya --restart unless-stopped \
  --cpus 4 --memory 6g --pids-limit 256 --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,size=128m \
  -e HF_HUB_OFFLINE=1 -e TRANSFORMERS_OFFLINE=1 \
  -p 127.0.0.1:18771:8771 \
  -v "$PWD/cache:/cache:ro" aeroplay-laya:0.1
```

The cache directory must be writable by UID 1000 during preparation. The model revision is fixed in `server.py`. Runtime uses the prepared cache with Hugging Face and Transformers offline flags. Wait for `/health` before connecting the frontend.

For local boundary tests, the standard Python library is sufficient; those tests substitute the model and do not measure its behavior:

```sh
python3 -m unittest -v test_server.py test_native_backend.py
```

## Verified GMK instance

On 2026-10-11, the serving endpoint was switched to Q8_0 with Vulkan on the Ryzen 7 7730U's integrated GPU. Deployment files are at `/home/yu/services/aeroplay-laya-q8`; the API container remains `aeroplay-laya`, with `aeroplay-laya-inference` supplying native decisions. The original PyTorch container is stopped as `aeroplay-laya-pytorch-rollback`, with its original source, image and model cache retained. `/home/yu/services/aeroplay-laya-q8/rollback.sh` stops the new Compose project and restores that original container.

The service URL remains `https://minifish-lab.taila2cd17.ts.net:8448`, through loopback port 18771. Actual requests from all ten adapter corpora, public-site CORS, private-network preflight, denied origins and inference stop/recovery passed before switching. Thirty production API observations measured approximately 172 ms median and 510 ms P95 on GMK loopback; the batch includes long puzzle descriptions and is not a constant latency for every game. The broader controlled comparison measured Flappy at about 81 ms median under native Vulkan, versus 290 ms under the previous PyTorch service.

Update native deployment source in its new directory and use `docker compose up -d --wait --force-recreate api` to reload the protocol adapter. Recheck health and actual decisions; do not restart unrelated local-model services. The earlier Sky Rush viewer on 8447 stays separate.

### Previous CPU deployment (retained for rollback)

On 2026-10-02, a separate `aeroplay-laya` container was started at `/home/yu/services/aeroplay-laya` on `minifish-lab`. It reuses the already prepared, pinned experimental runtime image `sha256:91279cd882b51185f7efdeb7c110feb00c9118cd5af0057e85510a664a6d41fc` and mounts the existing Sky Rush model cache read-only. The standalone Dockerfile above was not rebuilt for this deployment.

Service URL: `https://minifish-lab.taila2cd17.ts.net:8448` (tailnet access required). It proxies host loopback port 18771 to container port 8771. The earlier Sky Rush viewer on 8447 remains separate.

Health, the public game's exact CORS origin, authorized POST/private-network preflight, denied origins, and eleven model-independent boundary tests passed. Three actual requests against the pinned model returned the expected choices:

| Probe | Returned choice | Inference time |
| --- | --- | --- |
| Sky Rush right-lane ring | `2` | 290 ms |
| 2048 immediate equal-tile merge | `left` | 485 ms |
| Sixteen-option supplied tile location | `15` | 583 ms |

These are small API probes, not full game runs or concurrent-user benchmarks. The 16-option probe supplies the target tile in the observation; it verifies transport and model choice handling, not a Lights Out strategy.

To restore this previous CPU deployment, run the retained rollback script on GMK:

```sh
sudo /home/yu/services/aeroplay-laya-q8/rollback.sh
```

The active native deployment uses the new directory and Compose configuration above.
