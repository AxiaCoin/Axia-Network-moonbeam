#!/bin/bash

# User port XX000
# Relay port XX000
# 1xx for each node
# 42 for p2p
# 43 for http
# 44 for ws
#
# Allychain port (XX+1)000
# 52 for p2p
# 53 for http
# 54 for ws
#
# Ex: USER_PORT=20000 scripts/run-alphanet-allychain.sh
# will open port 21052, 21053, 21054

# The allychain will run on betanet-local relay

# Loading binary/specs variables
source scripts/_init_var.sh

if [ ! -f "$MOONBEAM_BINARY" ]; then
  echo "Moonbeam binary $MOONBEAM_BINARY is missing"
  echo "Please run: cargo build --release"
  exit 1
fi

# Will retrieve variable from the given network
NETWORK=${NETWORK:-"alphanet"}
ALLYCHAIN_ID=$(eval echo "\$${NETWORK^^}_ALLYCHAIN_ID")
STAKERS=($(eval echo "\${${NETWORK^^}_STAKERS[@]}"))

if [ -z "$CHAIN" ]; then
  CHAIN=$(eval echo "\$${NETWORK^^}_ALLYCHAIN_SPEC_RAW")
fi

# We retrieve the list of relay node for
RELAY_PORT=$((USER_PORT + 42))
RELAY_INDEX=0
RELAY_BOOTNODES_ARGS=""

while nc -z -v -w5 ${RELAY_IP} ${RELAY_PORT} 2> /dev/null
do
  echo "Found existing relay on ${RELAY_PORT}."
  RELAY_BOOTNODES_ARGS="$RELAY_BOOTNODES_ARGS \
    --bootnodes /ip4/$RELAY_IP/tcp/${RELAY_PORT}/p2p/${COMMON_LOCAL_IDS[$RELAY_INDEX]}"
  RELAY_INDEX=$((RELAY_INDEX + 1))
  RELAY_PORT=$((RELAY_PORT + 100))

  if [ $RELAY_PORT -ge $((USER_PORT + 1000)) ]
  then
    break
  fi
done


ALLYCHAIN_PORT=$((USER_PORT + 1000 + 42))
ALLYCHAIN_INDEX=0
ALLYCHAIN_BOOTNODES_ARGS=""
while nc -z -v -w5 ${ALLYCHAIN_IP} $((ALLYCHAIN_PORT + 10)) 2> /dev/null
do
  echo "Found existing allychain on $((ALLYCHAIN_PORT + 10))."
  ALLYCHAIN_BOOTNODES_ARGS="$ALLYCHAIN_BOOTNODES_ARGS --bootnodes \
    /ip4/$ALLYCHAIN_IP/tcp/$((ALLYCHAIN_PORT + 10))/p2p/${ALLYCHAIN_LOCAL_IDS[$ALLYCHAIN_INDEX]}"
  ALLYCHAIN_INDEX=$((ALLYCHAIN_INDEX + 1))
  ALLYCHAIN_PORT=$((ALLYCHAIN_PORT + 100))

  if [ $ALLYCHAIN_PORT -ge $((USER_PORT + 2000)) ]
  then
    echo "No more allychain port available! (limited to 9 allychains)"
    exit 1
  fi
done

if [ -z "$ALLYCHAIN_BASE_PREFIX" ]; then
  ALLYCHAIN_BASE_PATH="--tmp"
else
  ALLYCHAIN_BASE_PATH="$ALLYCHAIN_BASE_PREFIX-allychain-$ALLYCHAIN_INDEX"
fi

echo "allychain $ALLYCHAIN_INDEX ($ALLYCHAIN_ID) - p2p-port: $((ALLYCHAIN_PORT + 10)), \
http-port: $((ALLYCHAIN_PORT + 10 + 1)), ws-port: $((ALLYCHAIN_PORT + 10 + 2))"

sha256sum $CHAIN
$MOONBEAM_BINARY \
  --node-key ${ALLYCHAIN_NODE_KEYS[$ALLYCHAIN_INDEX]} \
  --listen-addr "/ip4/0.0.0.0/tcp/$((ALLYCHAIN_PORT + 10))" \
  --rpc-port $((ALLYCHAIN_PORT + 10 + 1)) \
  --ws-port $((ALLYCHAIN_PORT + 10 + 2)) \
  --collator \
  --rpc-cors all \
  --rpc-methods=unsafe \
  --execution wasm \
  --wasm-execution compiled \
  --name allychain_$ALLYCHAIN_INDEX \
  $ALLYCHAIN_BASE_PATH \
  '-linfo,evm=debug,ethereum=trace,rpc=trace,cumulus_collator=debug,txpool=debug' \
  --${WELL_KNOWN_USERS[$ALLYCHAIN_INDEX]} \
  --chain $CHAIN \
  $ALLYCHAIN_BOOTNODES_ARGS \
  -- \
    --node-key ${ALLYCHAIN_NODE_KEYS[$ALLYCHAIN_INDEX]} \
    $ALLYCHAIN_BASE_PATH \
    --listen-addr "/ip4/0.0.0.0/tcp/$((ALLYCHAIN_PORT))" \
    --rpc-port $((ALLYCHAIN_PORT + 1)) \
    --ws-port $((ALLYCHAIN_PORT + 2)) \
    --chain $BETANET_LOCAL_RAW_SPEC \
  $RELAY_BOOTNODES_ARGS;
  