import { createClient, defaultExchanges, subscriptionExchange } from "urql";
import { getGraphQLEndpoint } from "./utils";
// import { SubscriptionClient } from "subscriptions-transport-ws";

/*
const subscriptionClient = new SubscriptionClient(
  getGraphQLEndpoint().replace(/^http/, "ws"),
  {
    connectionParams: () => {
      const auth = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      return auth;
    },
    reconnect: true
  }
);
*/

export const GraphQLClient = createClient({
  url: getGraphQLEndpoint(),
  exchanges: [
    ...defaultExchanges,
    // Disable subscriptions for now
    /*
    subscriptionExchange({
      forwardSubscription: operation => subscriptionClient.request(operation)
    })*/
  ],
  fetchOptions: {
    cache: "no-cache",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  },
});
