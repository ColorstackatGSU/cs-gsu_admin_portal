import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="wrap-narrow" style={{ textAlign: 'center', paddingTop: 24 }}>
      <p className="notfound-code">404</p>
      <h1>Page not found</h1>
      <p className="page-sub" style={{ margin: '14px auto 24px' }}>
        That page doesn't exist. If you followed a link from another officer, the
        record may have been renamed or removed.
      </p>
      <Link to="/sponsors" className="btn btn-primary">
        Back to sponsors
      </Link>
    </div>
  );
}
