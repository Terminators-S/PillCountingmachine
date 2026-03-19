--
-- PostgreSQL database dump
--

\restrict GAkwMhe5yVq1EyMQSBlmffHhvQAgy68FMo6BeSq08SZVFQl7bM3Kuy7yY2zFQfa

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AuditActorType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuditActorType" AS ENUM (
    'USER',
    'API_KEY',
    'SYSTEM'
);


--
-- Name: InventoryTxnType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InventoryTxnType" AS ENUM (
    'RECEIVE',
    'DISPENSE',
    'ADJUST',
    'TRANSFER',
    'RESERVE',
    'RELEASE',
    'QUARANTINE',
    'WASTE',
    'CYCLE_COUNT'
);


--
-- Name: JobStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."JobStatus" AS ENUM (
    'CREATED',
    'IN_PROGRESS',
    'COMPLETED',
    'NEEDS_RECOUNT',
    'CANCELLED'
);


--
-- Name: MachineStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MachineStatus" AS ENUM (
    'ONLINE',
    'OFFLINE',
    'MAINTENANCE',
    'UNKNOWN'
);


--
-- Name: RoleCode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RoleCode" AS ENUM (
    'ADMIN',
    'SUPERVISOR',
    'OPERATOR',
    'AUDITOR',
    'VIEWER',
    'API_ONLY'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ApiKey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ApiKey" (
    id text NOT NULL,
    name text NOT NULL,
    "keyPrefix" text NOT NULL,
    "keyHash" text NOT NULL,
    scopes text[] DEFAULT ARRAY[]::text[],
    "isActive" boolean DEFAULT true NOT NULL,
    "createdById" text,
    "lastUsedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditLog" (
    id bigint NOT NULL,
    "actorType" public."AuditActorType" NOT NULL,
    "actorUserId" text,
    "actorApiKeyId" text,
    action text NOT NULL,
    "resourceType" text NOT NULL,
    "resourceId" text,
    "requestId" text,
    "ipAddress" text,
    "userAgent" text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: AuditLog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AuditLog_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AuditLog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AuditLog_id_seq" OWNED BY public."AuditLog".id;


--
-- Name: CountingJob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CountingJob" (
    id text NOT NULL,
    "jobNumber" text NOT NULL,
    "machineId" text NOT NULL,
    "pillTypeId" text NOT NULL,
    "targetQty" integer NOT NULL,
    "actualQty" integer,
    "lotPreferenceId" text,
    "tolerancePct" numeric(5,2) DEFAULT 2.00 NOT NULL,
    status public."JobStatus" DEFAULT 'CREATED'::public."JobStatus" NOT NULL,
    "createdById" text NOT NULL,
    "operatorId" text,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "recountOfJobId" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: CycleCountItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CycleCountItem" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    "lotId" text NOT NULL,
    "pillTypeId" text NOT NULL,
    "expectedQty" integer NOT NULL,
    "countedQty" integer NOT NULL,
    delta integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: CycleCountSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CycleCountSession" (
    id text NOT NULL,
    location text NOT NULL,
    "startedById" text NOT NULL,
    notes text,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone
);


--
-- Name: InventoryBalance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryBalance" (
    id text NOT NULL,
    "pillTypeId" text NOT NULL,
    "lotId" text NOT NULL,
    location text NOT NULL,
    "onHand" integer DEFAULT 0 NOT NULL,
    reserved integer DEFAULT 0 NOT NULL,
    quarantined integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: InventoryTransaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventoryTransaction" (
    id text NOT NULL,
    "txnType" public."InventoryTxnType" NOT NULL,
    "pillTypeId" text NOT NULL,
    "lotId" text,
    "machineId" text,
    "jobId" text,
    "operatorId" text,
    "approvedById" text,
    location text NOT NULL,
    "fromLocation" text,
    "toLocation" text,
    quantity integer NOT NULL,
    "idempotencyKey" text,
    "referenceType" text,
    "referenceId" text,
    reason text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: JobEvidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."JobEvidence" (
    id text NOT NULL,
    "jobId" text NOT NULL,
    url text NOT NULL,
    "evidenceType" text,
    "uploadedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: JobProgress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."JobProgress" (
    id text NOT NULL,
    "jobId" text NOT NULL,
    "progressQty" integer NOT NULL,
    message text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Lot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Lot" (
    id text NOT NULL,
    "pillTypeId" text NOT NULL,
    "lotNumber" text NOT NULL,
    "expiryDate" timestamp(3) without time zone NOT NULL,
    "receivedDate" timestamp(3) without time zone NOT NULL,
    "unitCost" numeric(12,4) NOT NULL,
    location text NOT NULL,
    "isQuarantined" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Machine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Machine" (
    id text NOT NULL,
    "machineCode" text NOT NULL,
    "displayName" text,
    location text NOT NULL,
    "firmwareVersion" text NOT NULL,
    status public."MachineStatus" DEFAULT 'UNKNOWN'::public."MachineStatus" NOT NULL,
    "lastSeen" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: MachineEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MachineEvent" (
    id text NOT NULL,
    "machineId" text NOT NULL,
    "eventType" text NOT NULL,
    payload jsonb,
    "occurredAt" timestamp(3) without time zone NOT NULL,
    "receivedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "idempotencyKey" text NOT NULL,
    "sourceIp" text,
    "sourceUserAgent" text
);


--
-- Name: PillType; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PillType" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "dosageMg" integer,
    manufacturer text,
    barcode text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: RefreshToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RefreshToken" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Role" (
    id text NOT NULL,
    code public."RoleCode" NOT NULL,
    name text NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    "fullName" text NOT NULL,
    "passwordHash" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: UserRole; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserRole" (
    "userId" text NOT NULL,
    "roleId" text NOT NULL
);


--
-- Name: AuditLog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog" ALTER COLUMN id SET DEFAULT nextval('public."AuditLog_id_seq"'::regclass);


--
-- Data for Name: ApiKey; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "isActive", "createdById", "lastUsedAt", "createdAt", "updatedAt") FROM stdin;
a298e3a6-11fd-40fe-af37-d134ae39db52	Seed machine key	mch_live	d844c64422ebdfb46366a5d027d53c8121545f47e94a7e9fa6fe5354dafe416a	{machine:write,events:write}	t	4ee237ac-7cb5-47ea-8983-da16b354e512	\N	2026-03-11 15:31:42.723	2026-03-11 15:31:42.723
\.


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AuditLog" (id, "actorType", "actorUserId", "actorApiKeyId", action, "resourceType", "resourceId", "requestId", "ipAddress", "userAgent", metadata, "createdAt") FROM stdin;
1	SYSTEM	\N	\N	POST /api/auth/login	auth	\N	46290088-83cd-4b71-98f5-b69172b7363b	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.26200; en-US) PowerShell/7.5.4	{"query": {}, "statusCode": 201}	2026-03-11 15:53:53.802
2	SYSTEM	\N	\N	POST /api/auth/login	auth	\N	b47e93d9-47ef-41bc-aa4c-cdf6ac9d3e55	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.26200; en-US) PowerShell/7.5.4	{"query": {}, "statusCode": 201}	2026-03-11 15:54:31.93
3	SYSTEM	\N	\N	POST /api/auth/login	auth	\N	e8823d80-b090-45f6-9f2e-7d75c146e0d3	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.26200; en-US) PowerShell/7.5.4	{"query": {}, "statusCode": 201}	2026-03-11 15:55:49.793
4	SYSTEM	\N	\N	POST /api/auth/login	auth	\N	ecfb1d3d-8991-4f2d-81a2-b17264e87e9f	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.26200; en-US) PowerShell/7.5.4	{"query": {}, "statusCode": 201}	2026-03-11 15:57:01.36
5	SYSTEM	\N	\N	POST /api/auth/refresh	auth	\N	2de353f0-ad18-413b-8eba-62fb7668a0b6	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	{"query": {}, "statusCode": 401}	2026-03-11 16:00:06.57
6	SYSTEM	\N	\N	POST /api/auth/refresh	auth	\N	c1d3d1b4-88db-4f5a-a18b-2bbd63ab91c3	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	{"query": {}, "statusCode": 401}	2026-03-11 16:00:06.624
7	SYSTEM	\N	\N	POST /api/auth/refresh	auth	\N	35746091-62cf-4bbc-b5a1-4c110a1b83a6	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	{"query": {}, "statusCode": 401}	2026-03-11 16:00:06.572
8	SYSTEM	\N	\N	POST /api/auth/refresh	auth	\N	c86ca748-a504-4727-b2e4-06c6aee739e6	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	{"query": {}, "statusCode": 401}	2026-03-11 16:00:06.627
9	SYSTEM	\N	\N	POST /api/auth/refresh	auth	\N	e6f3536c-a7f8-4fef-9549-7bf499da1e2b	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	{"query": {}, "statusCode": 401}	2026-03-11 16:00:06.628
10	SYSTEM	\N	\N	POST /api/auth/login	auth	\N	6499b105-18c5-4f1b-a1c3-74de47e32662	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	{"query": {}, "statusCode": 201}	2026-03-11 16:00:13.441
11	SYSTEM	\N	\N	POST /api/auth/login	auth	\N	52c390a9-4250-4141-af88-f67d0189dda7	::1	Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.26200; en-US) PowerShell/7.5.4	{"query": {}, "statusCode": 201}	2026-03-11 16:02:25.711
\.


--
-- Data for Name: CountingJob; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CountingJob" (id, "jobNumber", "machineId", "pillTypeId", "targetQty", "actualQty", "lotPreferenceId", "tolerancePct", status, "createdById", "operatorId", "startedAt", "completedAt", "recountOfJobId", notes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: CycleCountItem; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CycleCountItem" (id, "sessionId", "lotId", "pillTypeId", "expectedQty", "countedQty", delta, "createdAt") FROM stdin;
\.


--
-- Data for Name: CycleCountSession; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CycleCountSession" (id, location, "startedById", notes, "startedAt", "completedAt") FROM stdin;
\.


--
-- Data for Name: InventoryBalance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryBalance" (id, "pillTypeId", "lotId", location, "onHand", reserved, quarantined, "updatedAt") FROM stdin;
8037546b-bb5e-4088-aa05-656701c03de0	b03da7a1-a6e3-401f-968c-743aa78434f5	20e76a3b-a16d-42f5-8adb-7577d13e18b2	Main Pharmacy	1200	0	0	2026-03-11 15:31:42.737
2a94d399-09de-4be5-b894-09bfe7a379f0	4dcc0319-4047-48aa-9d64-cd029f9bf1c2	787d14ef-1da6-491b-aa88-b7594ac67167	Main Pharmacy	2000	0	0	2026-03-11 15:31:42.741
a4954e24-e511-4942-9ff0-a4e183184d2a	8268030a-308e-4541-b20c-beab4e6109d2	bad6ab9e-e4ac-43fd-a041-d48c76ef1c51	Main Pharmacy	800	0	0	2026-03-11 15:31:42.742
\.


--
-- Data for Name: InventoryTransaction; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventoryTransaction" (id, "txnType", "pillTypeId", "lotId", "machineId", "jobId", "operatorId", "approvedById", location, "fromLocation", "toLocation", quantity, "idempotencyKey", "referenceType", "referenceId", reason, metadata, "createdAt") FROM stdin;
8c798670-2965-4063-86ac-6ba7d9bc3594	RECEIVE	b03da7a1-a6e3-401f-968c-743aa78434f5	20e76a3b-a16d-42f5-8adb-7577d13e18b2	\N	\N	\N	\N	Main Pharmacy	\N	\N	1200	seed-receive-20e76a3b-a16d-42f5-8adb-7577d13e18b2	SEED	AMX-LOT-2401	Seed stock	\N	2026-03-11 15:31:42.739
6efb2b36-c70b-4452-9929-08fceda11803	RECEIVE	4dcc0319-4047-48aa-9d64-cd029f9bf1c2	787d14ef-1da6-491b-aa88-b7594ac67167	\N	\N	\N	\N	Main Pharmacy	\N	\N	2000	seed-receive-787d14ef-1da6-491b-aa88-b7594ac67167	SEED	PARA-LOT-2409	Seed stock	\N	2026-03-11 15:31:42.741
3851bd4c-ee1c-4cb5-8564-662cc9a5cf88	RECEIVE	8268030a-308e-4541-b20c-beab4e6109d2	bad6ab9e-e4ac-43fd-a041-d48c76ef1c51	\N	\N	\N	\N	Main Pharmacy	\N	\N	800	seed-receive-bad6ab9e-e4ac-43fd-a041-d48c76ef1c51	SEED	CETI-LOT-2501	Seed stock	\N	2026-03-11 15:31:42.743
\.


--
-- Data for Name: JobEvidence; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."JobEvidence" (id, "jobId", url, "evidenceType", "uploadedById", "createdAt") FROM stdin;
\.


--
-- Data for Name: JobProgress; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."JobProgress" (id, "jobId", "progressQty", message, "createdById", "createdAt") FROM stdin;
\.


--
-- Data for Name: Lot; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Lot" (id, "pillTypeId", "lotNumber", "expiryDate", "receivedDate", "unitCost", location, "isQuarantined", "createdAt", "updatedAt") FROM stdin;
20e76a3b-a16d-42f5-8adb-7577d13e18b2	b03da7a1-a6e3-401f-968c-743aa78434f5	AMX-LOT-2401	2027-08-31 00:00:00	2026-01-15 00:00:00	0.1200	Main Pharmacy	f	2026-03-11 15:31:42.733	2026-03-11 15:31:42.733
787d14ef-1da6-491b-aa88-b7594ac67167	4dcc0319-4047-48aa-9d64-cd029f9bf1c2	PARA-LOT-2409	2027-02-28 00:00:00	2026-02-12 00:00:00	0.0500	Main Pharmacy	f	2026-03-11 15:31:42.735	2026-03-11 15:31:42.735
bad6ab9e-e4ac-43fd-a041-d48c76ef1c51	8268030a-308e-4541-b20c-beab4e6109d2	CETI-LOT-2501	2026-12-31 00:00:00	2026-03-01 00:00:00	0.0800	Main Pharmacy	f	2026-03-11 15:31:42.736	2026-03-11 15:31:42.736
\.


--
-- Data for Name: Machine; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Machine" (id, "machineCode", "displayName", location, "firmwareVersion", status, "lastSeen", "createdAt", "updatedAt") FROM stdin;
ebc92530-b610-4463-b038-06b8c3e064f1	MCH-001	Main Line Counter	Main Pharmacy	1.2.0	ONLINE	2026-03-11 15:31:42.725	2026-03-11 15:31:42.726	2026-03-11 15:31:42.726
\.


--
-- Data for Name: MachineEvent; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."MachineEvent" (id, "machineId", "eventType", payload, "occurredAt", "receivedAt", "idempotencyKey", "sourceIp", "sourceUserAgent") FROM stdin;
a85d063a-9251-4e38-96a3-bce9e1ae98a6	ebc92530-b610-4463-b038-06b8c3e064f1	machine.register	{"location": "Main Pharmacy", "machineCode": "MCH-001", "firmwareVersion": "1.2.0"}	2026-03-11 15:31:42.743	2026-03-11 15:31:42.743	seed-register-ebc92530-b610-4463-b038-06b8c3e064f1	\N	\N
38ad7781-a531-4ee5-a9cd-db79a34dc4aa	ebc92530-b610-4463-b038-06b8c3e064f1	machine.heartbeat	{"status": "ONLINE", "queueDepth": 0}	2026-03-11 15:31:42.744	2026-03-11 15:31:42.745	seed-heartbeat-ebc92530-b610-4463-b038-06b8c3e064f1	\N	\N
\.


--
-- Data for Name: PillType; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PillType" (id, code, name, "dosageMg", manufacturer, barcode, "createdAt", "updatedAt") FROM stdin;
b03da7a1-a6e3-401f-968c-743aa78434f5	AMOX5	Amoxicillin	500	MedCo	1111111111111	2026-03-11 15:31:42.728	2026-03-11 15:31:42.728
4dcc0319-4047-48aa-9d64-cd029f9bf1c2	PARA500	Paracetamol	500	Health Labs	2222222222222	2026-03-11 15:31:42.73	2026-03-11 15:31:42.73
8268030a-308e-4541-b20c-beab4e6109d2	CETI10	Cetirizine	10	Allergy Pharma	3333333333333	2026-03-11 15:31:42.732	2026-03-11 15:31:42.732
\.


--
-- Data for Name: RefreshToken; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."RefreshToken" (id, "userId", "tokenHash", "expiresAt", "revokedAt", "createdAt") FROM stdin;
45360c2b-7b07-4c26-925e-9aacffba2783	4ee237ac-7cb5-47ea-8983-da16b354e512	34ff3735eda889f86eb6163e88c501a1be5d392fb292f9655d243e427771ed6f	2026-03-18 15:53:53.797	\N	2026-03-11 15:53:53.798
0576e2e2-f141-430c-96cf-86bf445df72d	4ee237ac-7cb5-47ea-8983-da16b354e512	b118efd4b2947938de168d2f0a27874280ac59de039b8447b6e835bdbe43e3ad	2026-03-18 15:54:31.927	\N	2026-03-11 15:54:31.928
8af323ad-9c82-4e94-8a63-319859be8add	4ee237ac-7cb5-47ea-8983-da16b354e512	a06bd041a7f9949f843bd91eaca8153476982203cebbd3dcf540b39dbc48bb06	2026-03-18 15:55:49.79	\N	2026-03-11 15:55:49.791
afc925b5-ea78-49b1-b7fd-0fb78f385ce7	4ee237ac-7cb5-47ea-8983-da16b354e512	efb0d775eac48cd7f94afc2406a6e1338b28ac39e38d8f21048e3a72aa8c6844	2026-03-18 15:57:01.354	\N	2026-03-11 15:57:01.356
785b06d4-a976-4fc8-9058-ad5252ef66c6	4ee237ac-7cb5-47ea-8983-da16b354e512	875a398028ee20746658d538d658819a031dbaead0481ce0422231a98a63a836	2026-03-18 16:00:13.438	\N	2026-03-11 16:00:13.438
204b47f9-ad95-4741-9dd1-4b6393fdb62b	4ee237ac-7cb5-47ea-8983-da16b354e512	510ca7d26cccf93ae57b96e5cf50532c99b020766e91e3cb609a4c76219e55d1	2026-03-18 16:02:25.707	\N	2026-03-11 16:02:25.708
\.


--
-- Data for Name: Role; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Role" (id, code, name) FROM stdin;
cca17e7e-9af6-4828-86f7-f17bdb90c7e1	ADMIN	Admin
4c671fa9-1adb-4ab6-ab1b-b378689250e7	SUPERVISOR	Supervisor
c496672c-ddea-4bcf-a1c9-33f0b8ad535f	OPERATOR	Operator
221d1224-e8f3-4f6f-b9ed-16f3824e5e6a	AUDITOR	Auditor
5416bdd5-9fe9-4d3b-bdd0-f138777316d0	VIEWER	Viewer
1b7cba45-3a0e-4016-b45f-e0795e66f182	API_ONLY	API-only
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."User" (id, email, "fullName", "passwordHash", "isActive", "createdAt", "updatedAt") FROM stdin;
4ee237ac-7cb5-47ea-8983-da16b354e512	admin@pillcount.local	Platform Admin	$2b$10$z4GxpmmDNWLhDkswAwlBHOLD4rdC3Tl7ii.XbrAMTWkPLeY.gLd2i	t	2026-03-11 15:31:42.714	2026-03-11 15:31:42.714
\.


--
-- Data for Name: UserRole; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."UserRole" ("userId", "roleId") FROM stdin;
4ee237ac-7cb5-47ea-8983-da16b354e512	cca17e7e-9af6-4828-86f7-f17bdb90c7e1
\.


--
-- Name: AuditLog_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public."AuditLog_id_seq"', 11, true);


--
-- Name: ApiKey ApiKey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiKey"
    ADD CONSTRAINT "ApiKey_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: CountingJob CountingJob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CountingJob"
    ADD CONSTRAINT "CountingJob_pkey" PRIMARY KEY (id);


--
-- Name: CycleCountItem CycleCountItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CycleCountItem"
    ADD CONSTRAINT "CycleCountItem_pkey" PRIMARY KEY (id);


--
-- Name: CycleCountSession CycleCountSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CycleCountSession"
    ADD CONSTRAINT "CycleCountSession_pkey" PRIMARY KEY (id);


--
-- Name: InventoryBalance InventoryBalance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryBalance"
    ADD CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY (id);


--
-- Name: InventoryTransaction InventoryTransaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY (id);


--
-- Name: JobEvidence JobEvidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JobEvidence"
    ADD CONSTRAINT "JobEvidence_pkey" PRIMARY KEY (id);


--
-- Name: JobProgress JobProgress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JobProgress"
    ADD CONSTRAINT "JobProgress_pkey" PRIMARY KEY (id);


--
-- Name: Lot Lot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Lot"
    ADD CONSTRAINT "Lot_pkey" PRIMARY KEY (id);


--
-- Name: MachineEvent MachineEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MachineEvent"
    ADD CONSTRAINT "MachineEvent_pkey" PRIMARY KEY (id);


--
-- Name: Machine Machine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Machine"
    ADD CONSTRAINT "Machine_pkey" PRIMARY KEY (id);


--
-- Name: PillType PillType_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PillType"
    ADD CONSTRAINT "PillType_pkey" PRIMARY KEY (id);


--
-- Name: RefreshToken RefreshToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "RefreshToken_pkey" PRIMARY KEY (id);


--
-- Name: Role Role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Role"
    ADD CONSTRAINT "Role_pkey" PRIMARY KEY (id);


--
-- Name: UserRole UserRole_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId", "roleId");


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: ApiKey_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ApiKey_isActive_idx" ON public."ApiKey" USING btree ("isActive");


--
-- Name: ApiKey_keyPrefix_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ApiKey_keyPrefix_key" ON public."ApiKey" USING btree ("keyPrefix");


--
-- Name: AuditLog_actorUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_actorUserId_idx" ON public."AuditLog" USING btree ("actorUserId");


--
-- Name: AuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_createdAt_idx" ON public."AuditLog" USING btree ("createdAt" DESC);


--
-- Name: AuditLog_resourceType_resourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON public."AuditLog" USING btree ("resourceType", "resourceId");


--
-- Name: CountingJob_jobNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CountingJob_jobNumber_key" ON public."CountingJob" USING btree ("jobNumber");


--
-- Name: CountingJob_machineId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CountingJob_machineId_status_idx" ON public."CountingJob" USING btree ("machineId", status);


--
-- Name: CountingJob_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CountingJob_status_createdAt_idx" ON public."CountingJob" USING btree (status, "createdAt" DESC);


--
-- Name: CycleCountItem_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CycleCountItem_sessionId_idx" ON public."CycleCountItem" USING btree ("sessionId");


--
-- Name: CycleCountSession_location_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CycleCountSession_location_startedAt_idx" ON public."CycleCountSession" USING btree (location, "startedAt" DESC);


--
-- Name: InventoryBalance_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventoryBalance_location_idx" ON public."InventoryBalance" USING btree (location);


--
-- Name: InventoryBalance_pillTypeId_lotId_location_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryBalance_pillTypeId_lotId_location_key" ON public."InventoryBalance" USING btree ("pillTypeId", "lotId", location);


--
-- Name: InventoryTransaction_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryTransaction_idempotencyKey_key" ON public."InventoryTransaction" USING btree ("idempotencyKey");


--
-- Name: InventoryTransaction_jobId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventoryTransaction_jobId_idx" ON public."InventoryTransaction" USING btree ("jobId");


--
-- Name: InventoryTransaction_location_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventoryTransaction_location_createdAt_idx" ON public."InventoryTransaction" USING btree (location, "createdAt" DESC);


--
-- Name: InventoryTransaction_lotId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventoryTransaction_lotId_createdAt_idx" ON public."InventoryTransaction" USING btree ("lotId", "createdAt" DESC);


--
-- Name: InventoryTransaction_pillTypeId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventoryTransaction_pillTypeId_createdAt_idx" ON public."InventoryTransaction" USING btree ("pillTypeId", "createdAt" DESC);


--
-- Name: JobEvidence_jobId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JobEvidence_jobId_idx" ON public."JobEvidence" USING btree ("jobId");


--
-- Name: JobProgress_jobId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JobProgress_jobId_createdAt_idx" ON public."JobProgress" USING btree ("jobId", "createdAt" DESC);


--
-- Name: Lot_expiryDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Lot_expiryDate_idx" ON public."Lot" USING btree ("expiryDate");


--
-- Name: Lot_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Lot_location_idx" ON public."Lot" USING btree (location);


--
-- Name: Lot_pillTypeId_lotNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Lot_pillTypeId_lotNumber_key" ON public."Lot" USING btree ("pillTypeId", "lotNumber");


--
-- Name: MachineEvent_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MachineEvent_idempotencyKey_key" ON public."MachineEvent" USING btree ("idempotencyKey");


--
-- Name: MachineEvent_machineId_eventType_occurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MachineEvent_machineId_eventType_occurredAt_idx" ON public."MachineEvent" USING btree ("machineId", "eventType", "occurredAt" DESC);


--
-- Name: MachineEvent_occurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MachineEvent_occurredAt_idx" ON public."MachineEvent" USING btree ("occurredAt" DESC);


--
-- Name: Machine_machineCode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Machine_machineCode_key" ON public."Machine" USING btree ("machineCode");


--
-- Name: Machine_status_lastSeen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Machine_status_lastSeen_idx" ON public."Machine" USING btree (status, "lastSeen");


--
-- Name: PillType_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PillType_code_key" ON public."PillType" USING btree (code);


--
-- Name: PillType_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PillType_name_idx" ON public."PillType" USING btree (name);


--
-- Name: RefreshToken_userId_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON public."RefreshToken" USING btree ("userId", "expiresAt");


--
-- Name: Role_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Role_code_key" ON public."Role" USING btree (code);


--
-- Name: UserRole_roleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserRole_roleId_idx" ON public."UserRole" USING btree ("roleId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: ApiKey ApiKey_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiKey"
    ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AuditLog AuditLog_actorApiKeyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_actorApiKeyId_fkey" FOREIGN KEY ("actorApiKeyId") REFERENCES public."ApiKey"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AuditLog AuditLog_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CountingJob CountingJob_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CountingJob"
    ADD CONSTRAINT "CountingJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CountingJob CountingJob_lotPreferenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CountingJob"
    ADD CONSTRAINT "CountingJob_lotPreferenceId_fkey" FOREIGN KEY ("lotPreferenceId") REFERENCES public."Lot"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CountingJob CountingJob_machineId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CountingJob"
    ADD CONSTRAINT "CountingJob_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES public."Machine"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CountingJob CountingJob_operatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CountingJob"
    ADD CONSTRAINT "CountingJob_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CountingJob CountingJob_pillTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CountingJob"
    ADD CONSTRAINT "CountingJob_pillTypeId_fkey" FOREIGN KEY ("pillTypeId") REFERENCES public."PillType"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CountingJob CountingJob_recountOfJobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CountingJob"
    ADD CONSTRAINT "CountingJob_recountOfJobId_fkey" FOREIGN KEY ("recountOfJobId") REFERENCES public."CountingJob"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CycleCountItem CycleCountItem_lotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CycleCountItem"
    ADD CONSTRAINT "CycleCountItem_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES public."Lot"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CycleCountItem CycleCountItem_pillTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CycleCountItem"
    ADD CONSTRAINT "CycleCountItem_pillTypeId_fkey" FOREIGN KEY ("pillTypeId") REFERENCES public."PillType"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CycleCountItem CycleCountItem_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CycleCountItem"
    ADD CONSTRAINT "CycleCountItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."CycleCountSession"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CycleCountSession CycleCountSession_startedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CycleCountSession"
    ADD CONSTRAINT "CycleCountSession_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventoryBalance InventoryBalance_lotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryBalance"
    ADD CONSTRAINT "InventoryBalance_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES public."Lot"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryBalance InventoryBalance_pillTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryBalance"
    ADD CONSTRAINT "InventoryBalance_pillTypeId_fkey" FOREIGN KEY ("pillTypeId") REFERENCES public."PillType"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryTransaction InventoryTransaction_approvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryTransaction InventoryTransaction_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."CountingJob"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryTransaction InventoryTransaction_lotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES public."Lot"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventoryTransaction InventoryTransaction_machineId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES public."Machine"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryTransaction InventoryTransaction_operatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InventoryTransaction InventoryTransaction_pillTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventoryTransaction"
    ADD CONSTRAINT "InventoryTransaction_pillTypeId_fkey" FOREIGN KEY ("pillTypeId") REFERENCES public."PillType"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: JobEvidence JobEvidence_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JobEvidence"
    ADD CONSTRAINT "JobEvidence_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."CountingJob"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: JobEvidence JobEvidence_uploadedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JobEvidence"
    ADD CONSTRAINT "JobEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: JobProgress JobProgress_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JobProgress"
    ADD CONSTRAINT "JobProgress_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: JobProgress JobProgress_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JobProgress"
    ADD CONSTRAINT "JobProgress_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."CountingJob"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Lot Lot_pillTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Lot"
    ADD CONSTRAINT "Lot_pillTypeId_fkey" FOREIGN KEY ("pillTypeId") REFERENCES public."PillType"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MachineEvent MachineEvent_machineId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MachineEvent"
    ADD CONSTRAINT "MachineEvent_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES public."Machine"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RefreshToken RefreshToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserRole UserRole_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserRole UserRole_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict GAkwMhe5yVq1EyMQSBlmffHhvQAgy68FMo6BeSq08SZVFQl7bM3Kuy7yY2zFQfa

