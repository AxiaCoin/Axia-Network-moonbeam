#/bin/sh

AXIA_COMMIT=$(egrep -o '/axia.*#([^\"]*)' Cargo.lock | head -1 | sed 's/.*#//' |  cut -c1-8)
DOCKER_TAG="axia-tech/moonbase-relay-testnet:sha-$AXIA_COMMIT"

# Build relay binary if needed
AXIA_EXISTS=docker manifest inspect $DOCKER_TAG > /dev/null && "true" || "false"
if [[ "$AXIA_EXISTS" == "false" ]]; then
  # $AXIA_COMMIT is used to build the relay image
  ./scripts/build-alphanet-relay-image.sh
fi

# Get relay binary
docker create -ti --name dummy $DOCKER_TAG bash
docker cp dummy:/usr/local/bin/axia target/release/axia
docker rm -f dummy
