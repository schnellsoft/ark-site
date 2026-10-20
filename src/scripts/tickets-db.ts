/** Client-side ticket conversation store (IndexedDB, 7-day retention). */

export const TICKETS_DB = 'ark-tickets';
export const TICKETS_STORE = 'conversations';
export const TICKET_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ACTIVE_TICKET_KEY = 'ark-active-ticket-id';

export type TicketMessage = {
	id: string;
	role: 'patient' | 'clinic' | 'system';
	body: string;
	createdAt: string;
	/** Admin ticket_messages.id when synced from / mirrored to the server. */
	serverMessageId?: string | null;
};

export type TicketConversation = {
	id: string;
	serverTicketId: string | null;
	patientName: string;
	patientEmail: string;
	patientPhone: string;
	observations: string;
	serviceSlugs: string[];
	messages: TicketMessage[];
	createdAt: string;
	expiresAt: string;
	updatedAt: string;
};

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(TICKETS_DB, 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(TICKETS_STORE)) {
				db.createObjectStore(TICKETS_STORE, { keyPath: 'id' });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
	});
}

function txDone(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error ?? new Error('IndexedDB tx failed'));
		tx.onabort = () => reject(tx.error ?? new Error('IndexedDB tx aborted'));
	});
}

export async function purgeExpiredTickets(): Promise<void> {
	const db = await openDb();
	const tx = db.transaction(TICKETS_STORE, 'readwrite');
	const store = tx.objectStore(TICKETS_STORE);
	const now = Date.now();
	await new Promise<void>((resolve, reject) => {
		const req = store.openCursor();
		req.onsuccess = () => {
			const cursor = req.result;
			if (!cursor) {
				resolve();
				return;
			}
			const value = cursor.value as TicketConversation;
			if (new Date(value.expiresAt).getTime() <= now) {
				cursor.delete();
			}
			cursor.continue();
		};
		req.onerror = () => reject(req.error);
	});
	await txDone(tx);
	db.close();
}

export async function saveConversation(
	convo: TicketConversation,
): Promise<TicketConversation> {
	await purgeExpiredTickets();
	const db = await openDb();
	const tx = db.transaction(TICKETS_STORE, 'readwrite');
	tx.objectStore(TICKETS_STORE).put(convo);
	await txDone(tx);
	db.close();
	try {
		localStorage.setItem(ACTIVE_TICKET_KEY, convo.id);
	} catch {
		/* ignore */
	}
	return convo;
}

export async function getConversation(
	id: string,
): Promise<TicketConversation | null> {
	await purgeExpiredTickets();
	const db = await openDb();
	const tx = db.transaction(TICKETS_STORE, 'readonly');
	const store = tx.objectStore(TICKETS_STORE);
	const result = await new Promise<TicketConversation | null>((resolve, reject) => {
		const req = store.get(id);
		req.onsuccess = () => resolve((req.result as TicketConversation) ?? null);
		req.onerror = () => reject(req.error);
	});
	await txDone(tx);
	db.close();
	if (!result) return null;
	if (new Date(result.expiresAt).getTime() <= Date.now()) return null;
	return result;
}

export async function getActiveConversation(): Promise<TicketConversation | null> {
	await purgeExpiredTickets();
	let id = '';
	try {
		id = localStorage.getItem(ACTIVE_TICKET_KEY) || '';
	} catch {
		id = '';
	}
	if (id) {
		const found = await getConversation(id);
		if (found) return found;
	}
	const db = await openDb();
	const tx = db.transaction(TICKETS_STORE, 'readonly');
	const store = tx.objectStore(TICKETS_STORE);
	const all = await new Promise<TicketConversation[]>((resolve, reject) => {
		const req = store.getAll();
		req.onsuccess = () => resolve((req.result as TicketConversation[]) || []);
		req.onerror = () => reject(req.error);
	});
	await txDone(tx);
	db.close();
	const now = Date.now();
	const live = all
		.filter((c) => new Date(c.expiresAt).getTime() > now)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return live[0] ?? null;
}

export function newMessage(
	role: TicketMessage['role'],
	body: string,
): TicketMessage {
	return {
		id: crypto.randomUUID(),
		role,
		body,
		createdAt: new Date().toISOString(),
	};
}

export function createConversationDraft(input: {
	patientName: string;
	patientEmail: string;
	patientPhone: string;
	observations: string;
	serviceSlugs: string[];
	autoReply: string;
}): TicketConversation {
	const now = Date.now();
	const createdAt = new Date(now).toISOString();
	const patientBody = [
		input.observations.trim() || '(no observations)',
		input.serviceSlugs.length
			? `Selected services: ${input.serviceSlugs.join(', ')}`
			: '',
	]
		.filter(Boolean)
		.join('\n\n');

	return {
		id: crypto.randomUUID(),
		serverTicketId: null,
		patientName: input.patientName.trim(),
		patientEmail: input.patientEmail.trim(),
		patientPhone: input.patientPhone.trim(),
		observations: input.observations.trim(),
		serviceSlugs: [...input.serviceSlugs],
		messages: [
			newMessage('patient', patientBody),
			newMessage('clinic', input.autoReply),
		],
		createdAt,
		expiresAt: new Date(now + TICKET_TTL_MS).toISOString(),
		updatedAt: createdAt,
	};
}

export async function appendMessage(
	id: string,
	message: TicketMessage,
): Promise<TicketConversation | null> {
	const convo = await getConversation(id);
	if (!convo) return null;
	convo.messages.push(message);
	convo.updatedAt = new Date().toISOString();
	return saveConversation(convo);
}

export async function postTicketToAdmin(
	adminApiUrl: string,
	convo: TicketConversation,
): Promise<string> {
	const base = adminApiUrl.replace(/\/$/, '').trim();
	if (!base) {
		throw new Error('Admin API URL is not configured');
	}
	const res = await fetch(`${base}/api/public/tickets`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			subject: `Appointment request — ${convo.patientName}`,
			body: convo.observations || 'Appointment request',
			fromName: convo.patientName,
			fromEmail: convo.patientEmail,
			fromPhone: convo.patientPhone,
			serviceSlugs: convo.serviceSlugs,
		}),
	});
	if (!res.ok) {
		throw new Error(`Ticket create failed (${res.status})`);
	}
	const data = (await res.json()) as { id?: string };
	if (!data.id) {
		throw new Error('Ticket create returned no id');
	}
	return data.id;
}

type ServerTicketMessage = {
	id: string;
	kind: 'patient' | 'staff';
	body: string;
	authorName: string;
	createdAt: string;
};

function adminBase(adminApiUrl: string): string {
	const base = adminApiUrl.replace(/\/$/, '').trim();
	if (!base) throw new Error('Admin API URL is not configured');
	return base;
}

/** Pull staff replies from admin and merge into the local conversation. */
export async function syncTicketMessagesFromAdmin(
	adminApiUrl: string,
	convo: TicketConversation,
): Promise<TicketConversation> {
	if (!convo.serverTicketId) return convo;
	const base = adminBase(adminApiUrl);
	const url = new URL(`${base}/api/public/tickets/${convo.serverTicketId}/messages`);
	url.searchParams.set('email', convo.patientEmail);
	const res = await fetch(url.toString(), { method: 'GET' });
	if (!res.ok) return convo;
	const data = (await res.json()) as { messages?: ServerTicketMessage[] };
	const remote = data.messages ?? [];
	const known = new Set(
		convo.messages
			.map((m) => m.serverMessageId)
			.filter((id): id is string => Boolean(id)),
	);
	function toIso(raw: string): string {
		const s = String(raw || '').trim();
		if (!s) return new Date().toISOString();
		if (s.includes('T')) {
			return s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`;
		}
		// D1 datetime('now') → "YYYY-MM-DD HH:MM:SS" (UTC)
		return `${s.replace(' ', 'T')}Z`;
	}

	let changed = false;
	for (const msg of remote) {
		if (msg.kind !== 'staff') continue;
		if (known.has(msg.id)) continue;
		convo.messages.push({
			id: crypto.randomUUID(),
			role: 'clinic',
			body: msg.body,
			createdAt: toIso(msg.createdAt),
			serverMessageId: msg.id,
		});
		known.add(msg.id);
		changed = true;
	}
	if (!changed) return convo;
	convo.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	convo.updatedAt = new Date().toISOString();
	return saveConversation(convo);
}

/** Post a patient follow-up to admin and store the server message id locally. */
export async function postPatientReplyToAdmin(
	adminApiUrl: string,
	convo: TicketConversation,
	body: string,
): Promise<TicketConversation> {
	if (!convo.serverTicketId) {
		throw new Error('Conversation has no server ticket');
	}
	const base = adminBase(adminApiUrl);
	const res = await fetch(
		`${base}/api/public/tickets/${convo.serverTicketId}/messages`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: convo.patientEmail,
				body,
				fromName: convo.patientName,
			}),
		},
	);
	if (!res.ok) {
		throw new Error(`Reply failed (${res.status})`);
	}
	const data = (await res.json()) as { id?: string };
	const local = newMessage('patient', body);
	local.serverMessageId = data.id ?? null;
	return (await appendMessage(convo.id, local)) ?? convo;
}
