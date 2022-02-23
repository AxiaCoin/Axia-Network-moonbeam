#!/bin/bash
set -e
source scripts/_init_var.sh

echo "=================== Alphanet ==================="
$MOONBEAM_BINARY build-spec \
  --disable-default-bootnode \
  --chain 'moonbase-local' \
  | grep '\"code\"' \
  | head -n1 > $ALPHANET_ALLYCHAIN_SPEC_TMP
echo $ALPHANET_ALLYCHAIN_SPEC_TMP generated	

echo "Using $ALPHANET_ALLYCHAIN_SPEC_TEMPLATE..."	
sed -e "/\"<runtime_code>\"/{r $ALPHANET_ALLYCHAIN_SPEC_TMP" -e 'd;}'  $ALPHANET_ALLYCHAIN_SPEC_TEMPLATE \
  > $ALPHANET_ALLYCHAIN_SPEC_PLAIN	
echo $ALPHANET_ALLYCHAIN_SPEC_PLAIN generated

$MOONBEAM_BINARY build-spec \
  --disable-default-bootnode \
  --raw \
  --chain $ALPHANET_ALLYCHAIN_SPEC_PLAIN \
  > $ALPHANET_ALLYCHAIN_SPEC_RAW
echo $ALPHANET_ALLYCHAIN_SPEC_RAW generated

$MOONBEAM_BINARY export-genesis-wasm \
  --chain $ALPHANET_ALLYCHAIN_SPEC_RAW \
  > $ALPHANET_WASM;
echo $ALPHANET_WASM generated

$MOONBEAM_BINARY export-genesis-state \
  --allychain-id $ALPHANET_ALLYCHAIN_ID \
  --chain $ALPHANET_ALLYCHAIN_SPEC_RAW \
  > $ALPHANET_GENESIS;
echo $ALPHANET_GENESIS generated

cp $ALPHANET_ALLYCHAIN_EMBEDDED_SPEC $ALPHANET_BUILD_FOLDER/allychain-embedded-specs.json
cp $ALPHANET_BETANET_EMBEDDED_SPEC $ALPHANET_BUILD_FOLDER/betanet-embedded-specs.json
grep -v '/p2p/' $ALPHANET_ALLYCHAIN_EMBEDDED_SPEC > \
  $ALPHANET_BUILD_FOLDER/allychain-embedded-no-bootnodes-specs.json
grep -v '/p2p/' $ALPHANET_BETANET_EMBEDDED_SPEC > \
  $ALPHANET_BUILD_FOLDER/betanet-embedded-no-bootnodes-specs.json
