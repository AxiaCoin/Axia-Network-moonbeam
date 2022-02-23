#!/bin/bash
# Loading binary/specs variables

if [ -z "$AXIA_COMMIT" ]; then
  AXIA_COMMIT=`egrep -o '/axia.*#([^\"]*)' Cargo.lock | \
    head -1 | sed 's/.*#//' |  cut -c1-8`
fi

if [ -z "$AXIA_REPO" ]; then
  AXIA_REPO=`egrep -o 'https://github.com/[^\/]*/axia\\?branch=' Cargo.lock | \
    head -1 | sed 's/?branch=//'`
fi

echo "Using AXIA from $AXIA_REPO revision #${AXIA_COMMIT}"

docker build . -f docker/axia-relay.Dockerfile \
  --build-arg AXIA_COMMIT="$AXIA_COMMIT" \
  --build-arg AXIA_REPO="$AXIA_REPO" \
  -t axia-tech/moonbase-relay-testnet:sha-$AXIA_COMMIT
