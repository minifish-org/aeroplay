# Optional Laya decision service

AeroPlay's human game modes and bundled assets remain independent of this service. Without a configured service URL, no background Laya requests are made. Connection checks run for a configured address while online, or when a player tests an address; decision requests run only in Watch Laya mode. Configure one URL for the whole arcade; individual game adapters provide their own observations, questions, and legal choices.

This service reads those observations with the pinned Laya model. It does not inspect hidden game answers, solve games on the server, replace a model answer with a rule, or promise that Laya can complete every game. Invalid choices, truncated observations, busy inference, and connection failures produce explicit errors.

## API

`GET /health` is cheap and remains available while inference is busy:

```json
{
  "ready": true,
  "model": "convaiinnovations/laya",
  "revision": "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851",
  "protocol": "aeroplay-laya-v1",
  "games": ["sky", "cargo", "snake", "tetris", "2048", "flappy", "maze", "match3", "sudoku", "lightsout"],
  "device": "cpu",
  "threads": 4
}
```

The game list declares accepted adapter IDs, not measured completion rates. `ready` becomes true after loading and warming the model; the HTTP server starts after that preparation succeeds.

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

Bounds: 16 KiB body, 6,000 context characters, 600 instruction characters, 1–16 options, 64-character keys, and 400-character option descriptions. Model input is bounded to 1,024 tokens with a 512-token question head; keep observations and options short. Input or option truncation returns 422. Only one inference runs at a time; another decision returns 429 rather than waiting in an unbounded queue. At most 16 HTTP handlers run, and incomplete body reads time out after five seconds.

The pinned checkpoint's calibration for 11 or more choices falls outside the SDK's accepted range and is clamped by Laya 0.3.22. This API does not expose confidence values or use a confidence threshold.

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
python3 -m unittest -v test_server.py
```

## Verified GMK instance

On 2026-10-02, a separate `aeroplay-laya` container was started at `/home/yu/services/aeroplay-laya` on `minifish-lab`. It reuses the already prepared, pinned experimental runtime image `sha256:91279cd882b51185f7efdeb7c110feb00c9118cd5af0057e85510a664a6d41fc` and mounts the existing Sky Rush model cache read-only. The standalone Dockerfile above was not rebuilt for this deployment.

Service URL: `https://minifish-lab.taila2cd17.ts.net:8448` (tailnet access required). It proxies host loopback port 18771 to container port 8771. The earlier Sky Rush viewer on 8447 remains separate.

Health, the public game's exact CORS origin, authorized POST/private-network preflight, denied origins, and eleven model-independent boundary tests passed. Three actual requests against the pinned model returned the expected choices:

| Probe | Returned choice | Inference time |
| --- | --- | --- |
| Sky Rush right-lane ring | `2` | 290 ms |
| 2048 immediate equal-tile merge | `left` | 485 ms |
| Sixteen-option supplied tile location | `15` | 583 ms |

These are small API probes, not full game runs or concurrent-user benchmarks. The 16-option probe supplies the target tile in the observation; it verifies transport and model choice handling, not a Lights Out strategy.

To stop only this instance:

```sh
sudo tailscale serve --https=8448 off
sudo docker stop aeroplay-laya
```

To start it again:

```sh
sudo docker start aeroplay-laya
sudo tailscale serve --bg --https=8448 http://127.0.0.1:18771
```

Copy an updated `server.py` into `/home/yu/services/aeroplay-laya` and restart only `aeroplay-laya` to update the service. Recheck `/health` and a real `/decision` afterwards.
