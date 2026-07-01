#!/bin/bash
export SWIMCHAIN_PASSWORD=testpass
exec target/release/sw.exe --testnet --data-dir alpha-testnet node start --listen 127.0.0.1:19745
