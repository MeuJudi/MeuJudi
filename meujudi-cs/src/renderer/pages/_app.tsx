import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>MeuJudi Sync</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="MeuJudi Sync — sincronização do escritório com o MeuJudi" />
        <meta name="color-scheme" content="light" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
