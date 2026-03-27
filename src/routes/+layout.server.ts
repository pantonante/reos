import type { LayoutServerLoad } from './$types';
import { isLocalhost } from '$lib/server/localhost';

export const load: LayoutServerLoad = ({ getClientAddress }) => {
	return { isLocalhost: isLocalhost(getClientAddress()) };
};
