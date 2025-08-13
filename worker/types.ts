export interface Env {
	TLDRAW_DURABLE_OBJECT: DurableObjectNamespace
	TLDRAW_BUCKET: R2Bucket
	ROOM_DB: D1Database
	ASSETS?: Fetcher
	CLERK_SECRET_KEY?: string
	CLERK_PUBLISHABLE_KEY?: string
}