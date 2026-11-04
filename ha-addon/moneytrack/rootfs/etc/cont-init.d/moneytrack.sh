#!/usr/bin/with-contenv bashio
bashio::log.info "Preparing MoneyTrack runtime"
mkdir -p /run/moneytrack /data/logs
node /moneytrack/scripts/apply-base-path.mjs
