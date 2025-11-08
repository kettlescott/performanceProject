# BlazeDemo Load Test (k6 + Docker)

A simple performance testing setup for [BlazeDemo](https://blazedemo.com) using **k6** inside Docker.  
This is a quick demo project I use for daily practice and scripting exercises.

---

## 🧱 Build the Docker Image

```bash
docker build -t my-k6:blazedemo .

```
docker run --rm \
  -e BASE_URL=https://blazedemo.com \
  -e DURATION=2m -e RAMPUP=20s \
  -e RATE_J1=300 -e RATE_J2=150 -e RATE_J3=150 \
  -e SUMMARY_JSON=run-$(date +%s).json \
  -v "$PWD/results:/results" \
  my-k6:blazedemo --tag run_id=$(date +%s)
