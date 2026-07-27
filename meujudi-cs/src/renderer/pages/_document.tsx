import Document, { Html, Head, Main, NextScript } from 'next/document';

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="pt-BR">
        <Head>
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <body className="bg-gray-50 text-gray-900 antialiased">
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
