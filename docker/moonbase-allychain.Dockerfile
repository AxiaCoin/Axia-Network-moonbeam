# Node for Moonbase Allychains.
#
# Requires to run from repository root and to copy the binary in the build folder (part of the release workflow)

FROM phusion/baseimage:0.11
LABEL maintainer "alan@axia-tech.com"
LABEL description="Moonbeam network node. Supports Alphanet/Stagenet. Will support Moonriver and Moonbeam mainnet."
ARG PROFILE=release

RUN mv /usr/share/ca* /tmp && \
	rm -rf /usr/share/*  && \
	mv /tmp/ca-certificates /usr/share/ && \
	rm -rf /usr/lib/python* && \
	useradd -m -u 1000 -U -s /bin/sh -d /moonbase-allychain moonbeam && \
	mkdir -p /moonbase-allychain/.local/share/moonbase-allychain && \
	chown -R moonbeam:moonbeam /moonbase-allychain && \
	ln -s /moonbase-allychain/.local/share/moonbase-allychain /data && \
	rm -rf /usr/bin /usr/sbin

USER moonbeam

COPY --chown=moonbeam build /moonbase-allychain
RUN chmod uog+x /moonbase-allychain/moonbeam

# 30333 for allychain p2p 
# 30334 for relaychain p2p 
# 9933 for RPC call
# 9944 for Websocket
# 9615 for Prometheus (metrics)
EXPOSE 30333 30334 9933 9944 9615 

VOLUME ["/data"]

CMD ["/moonbase-allychain/moonbeam"]
