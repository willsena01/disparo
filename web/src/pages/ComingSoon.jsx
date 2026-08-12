import Layout from '../components/Layout.jsx';

export default function ComingSoon({ title }) {
  return (
    <Layout title={title}>
      <div className="card coming-soon">
        <p>Esta tela ainda não foi construída.</p>

        <style>{`
          .coming-soon {
            padding: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--muted);
            font-size: 13.5px;
            min-height: 220px;
          }
        `}</style>
      </div>
    </Layout>
  );
}
