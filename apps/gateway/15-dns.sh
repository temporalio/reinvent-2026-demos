#!/bin/sh
# Works with Docker DNS and the Kubernetes pod's configured DNS server.
export DNS_RESOLVER="$(awk '/^nameserver/{print $2;exit}' /etc/resolv.conf)"
# nginx's resolver ignores resolv.conf search domains, so in Kubernetes a short
# Service name does not resolve. Qualify it with the pod's own namespace (the
# first search domain, <namespace>.svc.cluster.local). Docker's DNS resolves
# short names, and Docker copies the host's search domains, so leave it empty
# outside Kubernetes.
if [ -n "${KUBERNETES_SERVICE_HOST:-}" ]; then
  SVC_SUFFIX=".$(awk '/^search/{print $2;exit}' /etc/resolv.conf)"
else
  SVC_SUFFIX=""
fi
export SVC_SUFFIX
export CONTROL_HUB_URL="${CONTROL_HUB_URL:-http://control-hub${SVC_SUFFIX}:8090}"
