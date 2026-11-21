#!/bin/sh
# Works with Docker DNS and the Kubernetes pod's configured DNS server.
export DNS_RESOLVER="$(awk '/^nameserver/{print $2;exit}' /etc/resolv.conf)"
