import "@/styles/globals.css";
import { Provider } from "react-redux";
import store from "@/config/redux/store";
import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <Provider store={store}>
      <Head>
        <title>Ripple</title>
        <meta name="description" content="Share ideas, conversations, and moments on Ripple." />
      </Head>
      <Component {...pageProps} />
    </Provider>
  );
}
