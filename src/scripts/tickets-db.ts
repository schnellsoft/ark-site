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
