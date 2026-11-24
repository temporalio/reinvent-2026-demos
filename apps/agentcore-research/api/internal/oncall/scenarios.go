package oncall

// Scenario is an incident the presenter can start. The keys, services and
// alerts match agent/oncall/services.py, which holds the simulated readings;
// the API needs the titles here to show an incident before any Worker runs.
type Scenario struct {
	Key     string `json:"key"`
	Title   string `json:"title"`
	Service string `json:"service"`
	Alert   string `json:"alert"`
}

var scenarios = []Scenario{
	{Key: "bad-deploy", Title: "Checkout errors after a deploy", Service: "checkout-api", Alert: "checkout-api 5xx rate above 5% for 5 minutes"},
	{Key: "memory-leak", Title: "Search indexer restarting under memory pressure", Service: "search-indexer", Alert: "search-indexer pods OOMKilled 6 times in 30 minutes"},
	{Key: "traffic-surge", Title: "Payments latency during a traffic surge", Service: "payments-gateway", Alert: "payments-gateway p99 latency above 2s for 10 minutes"},
}

func scenarioByKey(key string) (Scenario, bool) {
	for _, s := range scenarios {
		if s.Key == key {
			return s, true
		}
	}
	return Scenario{}, false
}
