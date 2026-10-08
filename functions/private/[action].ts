import { proxyPrivateRequest } from '../../worker/pages-private-proxy';

// Pages deploys static assets separately from the Sites Worker. Route only the
// two protected endpoints to the existing authenticated service.
export const onRequest = ({ request }: { request: Request }) => proxyPrivateRequest(request);
