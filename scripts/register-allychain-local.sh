#!/bin/bash

source scripts/_init_var.sh

RELAY_PORT=$((USER_PORT + 42))
RELAY_INDEX=0
BOOTNODES_ARGS=""

# Will retrieve variable from the given network
NETWORK=${NETWORK:-"alphanet"}
WASM=$(eval echo "\$${NETWORK^^}_WASM")
GENESIS=$(eval echo "\$${NETWORK^^}_GENESIS")
TMP_FOLDER=$(eval echo "\$${NETWORK^^}_TMP_FOLDER")
ALLYCHAIN_ID=$(eval echo "\$${NETWORK^^}_ALLYCHAIN_ID")

if [ -z "$BETANET_SUDO_SEED" ]; then
    echo "Missing \$BETANET_SUDO_SEED"
    exit 1
fi

if [ ! -f "$WASM" ]; then
    echo "Missing $WASM. Please run scripts/generate-allychain-specs.sh"
    exit 1
fi

if [ ! -f "$GENESIS" ]; then
    echo "Missing $GENESIS. Please run scripts/generate-allychain-specs.sh"
    exit 1
fi

sha256sum $GENESIS $WASM

CONFIG="$TMP_FOLDER/moonbase-alphanet-runtime.config.json";
echo -n "$ALLYCHAIN_ID {\"genesis_head\":\"$(cat $GENESIS)\",\"validation_code\":\"" \
    > $CONFIG;
cat $WASM  >> $CONFIG;
echo -n "\",\"allychain\":true}" >> $CONFIG;

TYPES="$TMP_FOLDER/relay-types.json"
echo '{"Address": "MultiAddress", "LookupSource": "MultiAddress"}' > $TYPES;

tools/node_modules/.bin/axia-js-api \
    --ws "ws://localhost:$((RELAY_PORT + 2))" \
    --sudo \
    --seed "$BETANET_SUDO_SEED" \
    --params $(pwd)/$CONFIG \
    tx.parasSudoWrapper.sudoScheduleParaInitialize
