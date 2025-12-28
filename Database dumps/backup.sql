--
-- PostgreSQL database dump
--

\restrict 85zfy7HkZxYsoZgwaXbVzWFxBxcD1HI8xJc5xQSjUm659gToc4qfMDLKDTXy3kW

-- Dumped from database version 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: lad
--

CREATE TYPE public.app_role AS ENUM (
    'platform_admin',
    'platform_supporter',
    'consumer',
    'author',
    'editor',
    'chief_editor',
    'producer',
    'contributor'
);


ALTER TYPE public.app_role OWNER TO lad;

--
-- Name: contribution_status; Type: TYPE; Schema: public; Owner: lad
--

CREATE TYPE public.contribution_status AS ENUM (
    'approved',
    'rejected',
    'undecided'
);


ALTER TYPE public.contribution_status OWNER TO lad;

--
-- Name: proposal_status; Type: TYPE; Schema: public; Owner: lad
--

CREATE TYPE public.proposal_status AS ENUM (
    'undecided',
    'approved',
    'declined'
);


ALTER TYPE public.proposal_status OWNER TO lad;

--
-- Name: proposal_target; Type: TYPE; Schema: public; Owner: lad
--

CREATE TYPE public.proposal_target AS ENUM (
    'story_title',
    'chapter',
    'paragraph',
    'branch'
);


ALTER TYPE public.proposal_target OWNER TO lad;

--
-- Name: visibility_type; Type: TYPE; Schema: public; Owner: lad
--

CREATE TYPE public.visibility_type AS ENUM (
    'public',
    'private',
    'anonymous'
);


ALTER TYPE public.visibility_type OWNER TO lad;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: authors; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.authors (
    creator_id uuid NOT NULL,
    author_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.authors OWNER TO lad;

--
-- Name: branch_revisions; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.branch_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    prev_branch_name text,
    new_branch_name text NOT NULL,
    prev_branch_paragraphs text[],
    new_branch_paragraphs text[] NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revision_reason text,
    language text DEFAULT 'en'::text,
    revision_number integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.branch_revisions OWNER TO lad;

--
-- Name: chapter_comments; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.chapter_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chapter_comments OWNER TO lad;

--
-- Name: chapter_contributors; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.chapter_contributors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    user_id uuid NOT NULL,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chapter_contributors OWNER TO lad;

--
-- Name: chapter_likes; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.chapter_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_like boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chapter_likes OWNER TO lad;

--
-- Name: chapter_revisions; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.chapter_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    prev_chapter_title text,
    new_chapter_title text NOT NULL,
    prev_paragraphs text[],
    new_paragraphs text[] NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revision_reason text,
    language text DEFAULT 'en'::text,
    revision_number integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.chapter_revisions OWNER TO lad;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    story_title_id uuid,
    chapter_id uuid,
    paragraph_index integer,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_comment_id uuid
);


ALTER TABLE public.comments OWNER TO lad;

--
-- Name: contributions; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.contributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_title_id uuid NOT NULL,
    chapter_id uuid,
    branch_id uuid,
    paragraph_index integer,
    target_type text NOT NULL,
    source text NOT NULL,
    source_id text,
    author_user_id uuid,
    status public.contribution_status NOT NULL,
    words integer DEFAULT 0 NOT NULL,
    new_paragraph text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.contributions OWNER TO lad;

--
-- Name: crdt_changes; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.crdt_changes (
    id bigint NOT NULL,
    doc_id uuid NOT NULL,
    actor_id uuid,
    seq integer NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    patch bytea NOT NULL,
    is_snapshot boolean DEFAULT false NOT NULL
);


ALTER TABLE public.crdt_changes OWNER TO lad;

--
-- Name: crdt_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: lad
--

CREATE SEQUENCE public.crdt_changes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.crdt_changes_id_seq OWNER TO lad;

--
-- Name: crdt_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: lad
--

ALTER SEQUENCE public.crdt_changes_id_seq OWNED BY public.crdt_changes.id;


--
-- Name: crdt_documents; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.crdt_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doc_key text NOT NULL,
    story_title_id uuid,
    chapter_id uuid,
    branch_id uuid,
    doc_type text NOT NULL,
    is_canonical boolean DEFAULT true NOT NULL,
    owner_user_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.crdt_documents OWNER TO lad;

--
-- Name: crdt_proposals; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.crdt_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_title_id uuid NOT NULL,
    target_type public.proposal_target NOT NULL,
    target_chapter_id uuid,
    target_branch_id uuid,
    target_path text,
    proposed_text text NOT NULL,
    author_user_id uuid NOT NULL,
    status public.proposal_status DEFAULT 'undecided'::public.proposal_status NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    doc_id uuid
);


ALTER TABLE public.crdt_proposals OWNER TO lad;

--
-- Name: creative_spaces; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.creative_spaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    description text,
    path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.creative_spaces OWNER TO lad;

--
-- Name: editable_content; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.editable_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_path text NOT NULL,
    element_id text NOT NULL,
    content text NOT NULL,
    original_content text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    language text DEFAULT 'English'::text NOT NULL
);


ALTER TABLE public.editable_content OWNER TO lad;

--
-- Name: feature_suggestions; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.feature_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    first_name text,
    last_name text,
    email text,
    telephone text,
    can_contact boolean,
    contact_method text,
    description text NOT NULL,
    visibility public.visibility_type NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    attachments jsonb
);


ALTER TABLE public.feature_suggestions OWNER TO lad;

--
-- Name: local_users; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.local_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.local_users OWNER TO lad;

--
-- Name: paragraph_branches; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.paragraph_branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    parent_paragraph_index integer NOT NULL,
    parent_paragraph_text text NOT NULL,
    branch_text text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    metadata jsonb
);


ALTER TABLE public.paragraph_branches OWNER TO lad;

--
-- Name: paragraph_revisions; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.paragraph_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    paragraph_index integer NOT NULL,
    prev_paragraph text,
    new_paragraph text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revision_reason text,
    language text DEFAULT 'en'::text,
    revision_number integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.paragraph_revisions OWNER TO lad;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    first_name text,
    last_name text,
    nickname text,
    about text,
    bio text,
    interests text[] DEFAULT ARRAY[]::text[],
    profile_image_url text,
    birthday date,
    languages text[] DEFAULT ARRAY[]::text[],
    social_facebook text,
    social_snapchat text,
    social_instagram text,
    social_other text,
    telephone text,
    notify_phone boolean DEFAULT false,
    notify_app boolean DEFAULT true,
    notify_email boolean DEFAULT true,
    CONSTRAINT username_length CHECK ((char_length(username) >= 3))
);


ALTER TABLE public.profiles OWNER TO lad;

--
-- Name: reactions; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    story_title_id uuid,
    chapter_id uuid,
    paragraph_index integer,
    reaction_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.reactions OWNER TO lad;

--
-- Name: stories; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.stories (
    chapter_id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_title_id uuid NOT NULL,
    chapter_title text NOT NULL,
    paragraphs text[] DEFAULT ARRAY[]::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contribution_status public.contribution_status DEFAULT 'undecided'::public.contribution_status,
    contributor_id uuid,
    episode_number integer,
    part_number integer,
    chapter_index integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.stories OWNER TO lad;

--
-- Name: story_access; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.story_access (
    story_title_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'owner'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.story_access OWNER TO lad;

--
-- Name: story_attributes; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.story_attributes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id uuid NOT NULL,
    story_creator uuid NOT NULL,
    story_contributors text,
    new text NOT NULL,
    most_popular text,
    most_active text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_attributes_most_active_check CHECK ((most_active = ANY (ARRAY['YES'::text, 'NO'::text]))),
    CONSTRAINT story_attributes_most_popular_check CHECK ((most_popular = ANY (ARRAY['YES'::text, 'NO'::text]))),
    CONSTRAINT story_attributes_new_check CHECK ((new = ANY (ARRAY['YES'::text, 'NO'::text])))
);


ALTER TABLE public.story_attributes OWNER TO lad;

--
-- Name: story_initiators; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.story_initiators (
    creator_id uuid NOT NULL,
    initiator_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.story_initiators OWNER TO lad;

--
-- Name: story_title; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.story_title (
    story_title_id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    creator_id uuid,
    visibility text DEFAULT 'public'::text NOT NULL,
    published boolean DEFAULT true NOT NULL,
    genre text,
    tags text[]
);


ALTER TABLE public.story_title OWNER TO lad;

--
-- Name: story_title_revisions; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.story_title_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_title_id uuid NOT NULL,
    prev_title text,
    new_title text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revision_reason text,
    language text DEFAULT 'en'::text,
    revision_number integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.story_title_revisions OWNER TO lad;

--
-- Name: subscribers; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.subscribers OWNER TO lad;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


ALTER TABLE public.user_roles OWNER TO lad;

--
-- Name: crdt_changes id; Type: DEFAULT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_changes ALTER COLUMN id SET DEFAULT nextval('public.crdt_changes_id_seq'::regclass);


--
-- Data for Name: authors; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.authors (creator_id, author_id, created_at, updated_at) FROM stdin;
aef37573-600e-4442-9ae1-63a05799d9a0	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:32:07.197304+01	2025-12-23 11:39:51.722611+01
6f542cd0-551b-4ec9-b2b0-61113dd7af2b	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-23 12:12:53.237302+01	2025-12-23 12:12:53.237302+01
\.


--
-- Data for Name: branch_revisions; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.branch_revisions (id, branch_id, prev_branch_name, new_branch_name, prev_branch_paragraphs, new_branch_paragraphs, created_by, created_at, revision_reason, language, revision_number) FROM stdin;
\.


--
-- Data for Name: chapter_comments; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.chapter_comments (id, chapter_id, user_id, content, created_at) FROM stdin;
\.


--
-- Data for Name: chapter_contributors; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.chapter_contributors (id, chapter_id, user_id, added_by, created_at) FROM stdin;
\.


--
-- Data for Name: chapter_likes; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.chapter_likes (id, chapter_id, user_id, is_like, created_at) FROM stdin;
\.


--
-- Data for Name: chapter_revisions; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.chapter_revisions (id, chapter_id, prev_chapter_title, new_chapter_title, prev_paragraphs, new_paragraphs, created_by, created_at, revision_reason, language, revision_number) FROM stdin;
5d320e88-1080-4f96-a20d-90143f3432c2	7fdb3b9a-9cac-4f8f-b73e-75d3d0d489b3	Chapter 1 - The day I was conceived	Chapter 1 - The day I was conceived	{test}	{"test\nand this is just a message from Leo Love "}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-11 15:42:05.107501+01	Chapter updated	en	1
615ce439-5890-4d93-968c-eb8fa8ec267f	7fdb3b9a-9cac-4f8f-b73e-75d3d0d489b3	Chapter 1 - The day I was conceived	Chapter 1 - The day I was conceived	{"test\nand this is just a message from Leo Love "}	{"test\nand this is just a message from Leo Love \n\n\n\n\n\n\n"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-11 15:43:23.249216+01	Chapter updated	en	2
37a9b71e-9b30-4fa7-963d-91cf5c4bd42b	8c5e8979-f38f-481d-b6f1-453bff339ef0	Chapter 2 - I was born	Chapter 2 - I was born	{""}	{"and this is the thing"}	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-11 15:45:15.774299+01	Chapter updated	en	1
95a6f9e1-0537-4df9-a220-75cdaeb9e7d7	2fa7b19d-207c-4223-8f3c-19b3908f676f	Chapter 1 - The day I was conceived	The day I was conceived	{dsfhkjhdfjksdhf}	{dsfhkjhdfjksdhf}	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-14 10:09:46.767238+01	Chapter updated	en	1
a61c03f1-bb3e-476c-9d68-4e34666e6283	c584e977-a1df-4f83-be1b-9d31230b90aa	Intro	Intro	{Hello}	{"Hello dear friends"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 10:11:06.422511+01	Chapter updated	en	1
6432fc42-ec48-4e13-96b0-0b8ec05f1edd	2fa7b19d-207c-4223-8f3c-19b3908f676f	The day I was conceived	The day I was conceived	{dsfhkjhdfjksdhf}	{"Some proper text"}	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-14 10:12:02.688477+01	Chapter updated	en	2
1fb4f877-fd5c-4bef-8dd3-049477fa1fd5	914efa1d-c60d-4e02-8b3c-5d13b2cf4de4	The day I was born	The day I was born	{"It was a nice clear day. No clouds on the sky were to be seen. It was such a nice day."}	{"It was a nice clear day. No clouds on the sky were to be seen. It was such a nice day."}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 15:43:29.874107+01	Chapter updated	en	1
c5fd85e3-c40c-4518-9857-847d18eb9f9e	1ec2944b-5ca8-487a-bae0-b0de1e954071	Test 2	Test 2	{"Text 2"}	{"Text 2"}	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-14 15:50:45.668874+01	Chapter updated	en	1
f2054af6-1b82-4327-8e9e-55318ae588da	1ec2944b-5ca8-487a-bae0-b0de1e954071	Test 2	Test 2	{"Text 2"}	{"Text 2"}	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-14 15:51:21.167783+01	Chapter updated	en	2
7849cf4a-1e28-45f1-b40c-2cf775dadf9a	1ec2944b-5ca8-487a-bae0-b0de1e954071	Test 2	Test 2	{"Text 2"}	{"Text 2"}	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-14 15:51:33.255503+01	Chapter updated	en	3
110b62c5-0845-48a8-bb25-a6efbf712e8b	1ec2944b-5ca8-487a-bae0-b0de1e954071	Test 2	Test 1	{"Text 2"}	{"Text 2"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-14 23:44:24.433163+01	Chapter updated	en	4
3c68634a-0bfd-47a2-a7f7-e3b74cfa7bb6	1ec2944b-5ca8-487a-bae0-b0de1e954071	Test 1	Test 1	{"Text 2"}	{"Text 1"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-14 23:44:36.536174+01	Chapter updated	en	5
3d6fa31e-ecaf-4975-8933-4dc662ed5d82	9c50c0af-3cb5-405d-8502-c8d73feeda34	\N	Adult life	\N	{"YEAH, YEan, Yeah... yeah... WTH...."}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-16 19:49:54.275654+01	Chapter created	en	1
122a7812-a88a-4560-b7d8-7cf009d8c031	126491a2-b0e9-4ade-80bb-7ced696abeb2	College	College	{"First real life experiences"}	{"First real life experiences","Let's build that village"}	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-16 19:56:01.990416+01	Chapter updated	en	1
8ba2e8c3-97a4-400e-94b9-0d5199dfc5df	9c50c0af-3cb5-405d-8502-c8d73feeda34	Adult life	Adult life	{"YEAH, YEan, Yeah... yeah... WTH...."}	{"YEAH, YEah, Yeah... yeah... WTH...."}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-16 20:01:34.232212+01	Chapter updated	en	2
b2249803-b3b4-479b-aeea-8ed0858cb4b6	ba894805-d466-4ed5-b6e6-b276f9bbc232	\N	It takes a village to raise a child	\N	{"indeed so"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-17 14:25:58.756065+01	Chapter created	en	1
330e90e5-f7ee-47c0-a164-6a1d79e3fa7b	4dcdcd7c-b983-422f-8463-3edd7883497a	\N	Test chapter	\N	{"test text"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-17 14:32:45.956411+01	Chapter created	en	1
36812044-50fe-4e2c-8695-c67cd14a37c3	a5a6aecb-c23e-4c86-b9bf-d203ca73f02f	Chapter 1 - The day I was conceived	Chapter	{"Story of my life and other happy occurrences\n",sasshfjkhskjfhkjsdahf}	{"<!DOCTYPE HTML PUBLIC \\"-//W3C//DTD HTML 4.0//EN\\" \\"http://www.w3.org/TR/REC-html40/strict.dtd\\">\n<html><head><meta name=\\"qrichtext\\" content=\\"1\\" /><meta charset=\\"utf-8\\" /><style type=\\"text/css\\">\np, li { white-space: pre-wrap; }\nhr { height: 1px; border-width: 0; }\nli.unchecked::marker { content: \\"\\\\2610\\"; }\nli.checked::marker { content: \\"\\\\2612\\"; }\n</style></head><body style=\\" font-family:'Ubuntu'; font-size:10pt; font-weight:400; font-style:normal;\\">\n<h1 style=\\" margin-top:18px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><span style=\\" font-size:xx-large; font-weight:700;\\">Story of my wonderful life</span></h1>\n<h2 style=\\" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><span style=\\" font-size:x-large; font-weight:700;\\">Chapter 1 - The day I was conceived</span></h2>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">Story of my life and other happy occurrences</p>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">sasshfjkhskjfhkjsdahf</p>\n<h2 style=\\" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><span style=\\" font-size:x-large; font-weight:700;\\">Chapter 2</span></h2>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">Text</p>\n<h2 style=\\" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><span style=\\" font-size:x-large; font-weight:700;\\">Chapter 3</span></h2>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">Hello from admin</p>\n<h2 style=\\" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><span style=\\" font-size:x-large; font-weight:700;\\">Greeting from admin</span></h2>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">just a couple of words from the admin of this platform</p>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">And this should create a new paragraph</p>\n<p style=\\"-qt-paragraph-type:empty; margin-top:0px; margin-bottom:0px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><br /></p></body></html>"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:32:07.197304+01	Desktop sync	en	1
f95f704c-66ac-43ba-9cce-b49453176a54	44a93f69-03fa-4a4b-8218-c370477362be	Kindergarten	It takes a village to raise a child	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here before sync in the desktop app","Let's add something here on the crowdly web and see if it'll be syn-ed into the\ndesktop app","and now vice versa, if I add something here in the desktop app","and yes, it has worked out.","It is working. Hurray!"}	{"indeed so"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	7
e5fc449f-5e3d-4265-86f4-c052f9125517	e2bac731-67c3-4955-8d9d-83a8a98574ef	School	Kindergarten	{"Good and bad","Friends and enemies","School was somewhat ok, till I became teenager"}	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here before sync in the desktop app","Let's add something here on the crowdly web and see if it'll be syn-ed into the\ndesktop app","and now vice versa, if I add something here in the desktop app","and yes, it has worked out.","It is working. Hurray!"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	3
50ff5c66-de90-428f-a1ec-3e32e2b8bf7f	126491a2-b0e9-4ade-80bb-7ced696abeb2	College	School	{"First real life experiences","Let's build that village"}	{"Good and bad","Friends and enemies","School was somewhat ok, till I became teenager"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	2
6d83f73e-12b9-46bd-b150-65df00502c47	f3fd75b4-7102-4e30-a757-2eb609398ea6	Test from API 2	College	{One,Two,Three}	{"First real life experiences","Let's build that village"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	2
a76a193c-796c-4b66-a7e4-aeb2ce189ca5	b9f1de59-0c10-472f-8174-093d351f0e0c	Test from API 3	Test from API 2	{Alpha,Beta}	{One,Two,Three}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
f4e33ea6-8d1a-4d40-9571-9286cef89fa1	9c50c0af-3cb5-405d-8502-c8d73feeda34	Adult life	Test from API 3	{"YEAH, YEah, Yeah... yeah... WTH...."}	{Alpha,Beta}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	3
79e50738-b187-48c1-b198-c8cb2c5677bb	ba894805-d466-4ed5-b6e6-b276f9bbc232	When one meest her	Adult life	{"New text here"}	{"YEAH, YEah, Yeah... yeah... WTH...."}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	3
42ef5ae1-2f87-427a-9b4f-02f300348ad4	eb752fad-3eae-458a-97c5-6fa67e389bed	It takes a village to raise a child, again	When one meest her	{"indeed so","now it is us who need to find that village"}	{"New text here"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	3
ae72ba6b-26d0-4d3f-a4a3-b7d03c9cc435	a5a6aecb-c23e-4c86-b9bf-d203ca73f02f	Chapter	Chapter	{"<!DOCTYPE HTML PUBLIC \\"-//W3C//DTD HTML 4.0//EN\\" \\"http://www.w3.org/TR/REC-html40/strict.dtd\\">\n<html><head><meta name=\\"qrichtext\\" content=\\"1\\" /><meta charset=\\"utf-8\\" /><style type=\\"text/css\\">\np, li { white-space: pre-wrap; }\nhr { height: 1px; border-width: 0; }\nli.unchecked::marker { content: \\"\\\\2610\\"; }\nli.checked::marker { content: \\"\\\\2612\\"; }\n</style></head><body style=\\" font-family:'Ubuntu'; font-size:10pt; font-weight:400; font-style:normal;\\">\n<h1 style=\\" margin-top:18px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><span style=\\" font-size:xx-large; font-weight:700;\\">Story of my wonderful life</span></h1>\n<h2 style=\\" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><span style=\\" font-size:x-large; font-weight:700;\\">Chapter 1 - The day I was conceived</span></h2>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">Story of my life and other happy occurrences</p>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">sasshfjkhskjfhkjsdahf</p>\n<h2 style=\\" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><span style=\\" font-size:x-large; font-weight:700;\\">Chapter 2</span></h2>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">Text</p>\n<h2 style=\\" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><span style=\\" font-size:x-large; font-weight:700;\\">Chapter 3</span></h2>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">Hello from admin</p>\n<h2 style=\\" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><span style=\\" font-size:x-large; font-weight:700;\\">Greeting from admin</span></h2>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">just a couple of words from the admin of this platform</p>\n<p style=\\" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\">And this should create a new paragraph</p>\n<p style=\\"-qt-paragraph-type:empty; margin-top:0px; margin-bottom:0px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\\"><br /></p></body></html>"}	{}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:54:50.291524+01	Desktop sync	en	2
c8f753e6-54f7-459e-acd5-259e1821caa7	09a6b999-b8f0-4884-8bfe-f011ada44aaa	\N	Chapter	\N	{"# Story of my wonderful life"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:54:50.291524+01	Desktop sync (created)	en	1
6c02c041-6649-497e-bb09-a5460cdc339a	193ace2d-2766-46b7-852d-762e30cc590f	\N	Chapter 1 - The day I was conceived	\N	{"Story of my life and other happy occurrences",sasshfjkhskjfhkjsdahf}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:54:50.291524+01	Desktop sync (created)	en	1
f2a53a76-d035-43d3-b50b-25d43a81d1d0	4b9abf5d-447c-47e5-8ad9-461675c08a71	\N	Chapter 2	\N	{Text}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:54:50.291524+01	Desktop sync (created)	en	1
13c994d8-1ffe-4132-a004-fe2653957b48	ac6c9545-fcfc-48b5-9d5c-f353a4e49eb5	\N	Chapter 3	\N	{"Hello from admin"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:54:50.291524+01	Desktop sync (created)	en	1
61bff0aa-0c9c-46a9-a396-d1d7f4469b97	8e3f08fd-8393-4f70-ac20-1fc36958dff8	\N	Greeting from admin	\N	{"just a couple of words from the admin of this platform","And this should create a new paragraph"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:54:50.291524+01	Desktop sync (created)	en	1
5694dcc4-d54b-4e2f-a5fc-bcdba4b923a9	533a3846-2682-44c0-bd11-2f3942a0140e	\N	New chapter	\N	{"And a new chapter's text"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:54:50.291524+01	Desktop sync (created)	en	1
85a35cc2-5e73-49dc-bc34-e9baa85c8056	533a3846-2682-44c0-bd11-2f3942a0140e	New chapter	New chapter	{"And a new chapter's text"}	{"And a new chapter's text. Let's extend this text and see if it will be synced into the desktop app"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:56:01.995011+01	Chapter updated	en	2
ea9d74b0-a9fb-43d7-a7ab-9ce739296f5e	ba894805-d466-4ed5-b6e6-b276f9bbc232	It takes a village to raise a child	When one meest her	{"indeed so"}	{"New text here"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:07:03.489811+01	Desktop sync	en	2
298b7b85-c46b-4d9d-ba29-014d7c905129	eb752fad-3eae-458a-97c5-6fa67e389bed	\N	It takes a village to raise a child	\N	{"indeed so"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:07:03.489811+01	Desktop sync (created)	en	1
46175b2e-16c0-480a-bea4-8dee87497e83	f3fd75b4-7102-4e30-a757-2eb609398ea6	Test from API 2	Test from API 2	{One,Two}	{One,Two,Three}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 11:10:42.353519+01	Chapter updated	en	1
73340177-e779-47c7-a047-1fc1d61a63e4	44a93f69-03fa-4a4b-8218-c370477362be	Kindergarten	Kindergarten	{"I do NOT like it"}	{"I do NOT like it. Here are TOO MANY children... and they are noisy."}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 11:27:33.569952+01	Chapter updated	en	1
608b7d2b-16bc-4ab7-8b6b-4fc6eb4ac51f	e2bac731-67c3-4955-8d9d-83a8a98574ef	School	School	{"Good and bad","Friends and enemies"}	{"Good and bad","Friends and enemies\nSchool was ok, till I became teenagr"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:37:06.909053+01	Desktop sync	en	1
63a12e7f-e375-4006-8f57-e3100f42d887	44a93f69-03fa-4a4b-8218-c370477362be	Kindergarten	Kindergarten	{"I do NOT like it. Here are TOO MANY children... and they are noisy."}	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here on the crowdly web before sync in the desktop app is switched ON"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 11:50:57.021889+01	Chapter updated	en	2
15aecd40-cf0a-4cbc-8015-08cc9060746d	44a93f69-03fa-4a4b-8218-c370477362be	Kindergarten	Kindergarten	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here on the crowdly web before sync in the desktop app is switched ON"}	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here before sync in the desktop app"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:52:47.971815+01	Desktop sync	en	3
d48e39ef-ce03-4bf4-adc3-f4d53bea13a9	e2bac731-67c3-4955-8d9d-83a8a98574ef	School	School	{"Good and bad","Friends and enemies\nSchool was ok, till I became teenagr"}	{"Good and bad","Friends and enemies","School was somewhat ok, till I became teenager"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:52:47.971815+01	Desktop sync	en	2
d188dbbb-771d-466f-be3d-30c1b1066835	44a93f69-03fa-4a4b-8218-c370477362be	Kindergarten	Kindergarten	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here before sync in the desktop app"}	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here before sync in the desktop app","Let's add something here on the crowdly web and see if it'll be syn-ed into the desktop app"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 11:56:06.900003+01	Chapter updated	en	4
a5686414-c6c1-49ca-9557-d12116bb6e94	44a93f69-03fa-4a4b-8218-c370477362be	Kindergarten	Kindergarten	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here before sync in the desktop app","Let's add something here on the crowdly web and see if it'll be syn-ed into the desktop app"}	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here before sync in the desktop app","Let's add something here on the crowdly web and see if it'll be syn-ed into the\ndesktop app","and now vice versa, if I add something here in the desktop app"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:57:05.859652+01	Desktop sync	en	5
c190ac4c-e808-4396-b5c9-15684939876f	44a93f69-03fa-4a4b-8218-c370477362be	Kindergarten	Kindergarten	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here before sync in the desktop app","Let's add something here on the crowdly web and see if it'll be syn-ed into the\ndesktop app","and now vice versa, if I add something here in the desktop app"}	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here before sync in the desktop app","Let's add something here on the crowdly web and see if it'll be syn-ed into the\ndesktop app","and now vice versa, if I add something here in the desktop app","and yes, it has worked out.","It is working. Hurray!"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 11:58:25.148498+01	Chapter updated	en	6
76791185-50b5-43d1-8def-b6daa2ef7eab	520ff5b7-fc08-4c04-bdbb-8de2ad202972	And life goes on	And life goes on	{"as always"}	{"as always","**It takes a village to raise a child**","indeed so"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:13:16.439678+01	Desktop sync	en	1
dc115143-2179-431a-a624-5c6a42f502d3	eb752fad-3eae-458a-97c5-6fa67e389bed	It takes a village to raise a child	It takes a village to raise a child, again	{"indeed so"}	{"indeed so","now it is us who need to find that village"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:13:16.439678+01	Desktop sync	en	2
2e0aebc8-fd4a-4e83-8ac8-397a328ee722	520ff5b7-fc08-4c04-bdbb-8de2ad202972	And life goes on	And life goes on	{"as always","**It takes a village to raise a child**","indeed so"}	{"as always"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	2
3af70f52-2045-4870-a5da-4c22cb2c9c76	1028d940-b3ca-4253-b6c3-afd634ff0923	\N	It takes a village to raise a child, again	\N	{"indeed so","now it is us who need to find that village"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync (created)	en	1
4e05c3d7-6e67-468b-9cea-1e1cbf255869	44a93f69-03fa-4a4b-8218-c370477362be	It takes a village to raise a child	It takes a village to raise a child	{"indeed so"}	{"indeed so","Today on 23. December I add some changes on Crowdly web to see if the changes will be syn-ed into the desktop app 11:36 is the local time here in Munich"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:36:48.454628+01	Chapter updated	en	8
679fdfa5-434c-43f3-8e17-9b8ca62f4700	44a93f69-03fa-4a4b-8218-c370477362be	It takes a village to raise a child	It takes a village to raise a child	{"indeed so","Today on 23. December I add some changes on Crowdly web to see if the changes will be syn-ed into the desktop app 11:36 is the local time here in Munich"}	{"indeed so","Today on 23. December I add some changes on Crowdly web to see if the changes\nwill be syn-ed into the desktop app 11:36 is the local time here in Munich"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-23 11:39:51.722611+01	Desktop sync	en	9
f8e8fed5-b79d-4b01-9a63-639a23cb7295	1028d940-b3ca-4253-b6c3-afd634ff0923	It takes a village to raise a child, again	It takes a village to raise a child, again	{"indeed so","now it is us who need to find that village"}	{"indeed so","now it is us who need to find that village","Now I'm adding another paragraph in the desktop app as the user test to see the\nbehaviour of both desktop app and Crowdly web"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-23 11:39:51.722611+01	Desktop sync	en	2
0aa8f7b7-f93c-48f3-9bf6-ce6e8a7f402e	ac1f9d6b-85ca-4aed-b833-0d39e7f72111	Test	Test	{test}	{test,"I'm making changes to the story with the story ID\nhttp://localhost:8080/story/263cffb0-1899-44b9-8e2d-581114963274 in the desktop\napp to see the behaviour"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-23 12:12:53.237302+01	Desktop sync	en	1
df7ed402-e765-4db0-9e52-008eac4ec332	2fa7b19d-207c-4223-8f3c-19b3908f676f	The day I was conceived	The day I was conceived	{"Some proper text"}	{"Some proper text","and now I'm making changes on the Crowdly web platform to see if the changes will be sync-ed into the desktop app for the user test"}	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-23 12:14:16.36608+01	Chapter updated	en	3
\.


--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.comments (id, user_id, story_title_id, chapter_id, paragraph_index, body, created_at, parent_comment_id) FROM stdin;
\.


--
-- Data for Name: contributions; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.contributions (id, story_title_id, chapter_id, branch_id, paragraph_index, target_type, source, source_id, author_user_id, status, words, new_paragraph, created_at) FROM stdin;
679fdfa5-434c-43f3-8e17-9b8ca62f4700	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	44a93f69-03fa-4a4b-8218-c370477362be	\N	0	paragraph	legacy-backfill	679fdfa5-434c-43f3-8e17-9b8ca62f4700	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	2	indeed so	2025-12-23 11:39:51.722+01
f8e8fed5-b79d-4b01-9a63-639a23cb7295	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	1028d940-b3ca-4253-b6c3-afd634ff0923	\N	0	paragraph	legacy-backfill	f8e8fed5-b79d-4b01-9a63-639a23cb7295	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	2	indeed so	2025-12-23 11:39:51.722+01
4e05c3d7-6e67-468b-9cea-1e1cbf255869	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	44a93f69-03fa-4a4b-8218-c370477362be	\N	0	paragraph	legacy-backfill	4e05c3d7-6e67-468b-9cea-1e1cbf255869	aef37573-600e-4442-9ae1-63a05799d9a0	approved	2	indeed so	2025-12-23 11:36:48.454+01
f95f704c-66ac-43ba-9cce-b49453176a54	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	44a93f69-03fa-4a4b-8218-c370477362be	\N	0	paragraph	legacy-backfill	f95f704c-66ac-43ba-9cce-b49453176a54	aef37573-600e-4442-9ae1-63a05799d9a0	approved	2	indeed so	2025-12-23 11:14:13.629+01
42ef5ae1-2f87-427a-9b4f-02f300348ad4	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	eb752fad-3eae-458a-97c5-6fa67e389bed	\N	0	paragraph	legacy-backfill	42ef5ae1-2f87-427a-9b4f-02f300348ad4	aef37573-600e-4442-9ae1-63a05799d9a0	approved	3	New text here	2025-12-23 11:14:13.629+01
e5fc449f-5e3d-4265-86f4-c052f9125517	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	e2bac731-67c3-4955-8d9d-83a8a98574ef	\N	0	paragraph	legacy-backfill	e5fc449f-5e3d-4265-86f4-c052f9125517	aef37573-600e-4442-9ae1-63a05799d9a0	approved	14	I do NOT like it. Here are TOO MANY children... and they are noisy.	2025-12-23 11:14:13.629+01
f4e33ea6-8d1a-4d40-9571-9286cef89fa1	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	9c50c0af-3cb5-405d-8502-c8d73feeda34	\N	0	paragraph	legacy-backfill	f4e33ea6-8d1a-4d40-9571-9286cef89fa1	aef37573-600e-4442-9ae1-63a05799d9a0	approved	1	Alpha	2025-12-23 11:14:13.629+01
79e50738-b187-48c1-b198-c8cb2c5677bb	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	ba894805-d466-4ed5-b6e6-b276f9bbc232	\N	0	paragraph	legacy-backfill	79e50738-b187-48c1-b198-c8cb2c5677bb	aef37573-600e-4442-9ae1-63a05799d9a0	approved	5	YEAH, YEah, Yeah... yeah... WTH....	2025-12-23 11:14:13.629+01
6d83f73e-12b9-46bd-b150-65df00502c47	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	f3fd75b4-7102-4e30-a757-2eb609398ea6	\N	0	paragraph	legacy-backfill	6d83f73e-12b9-46bd-b150-65df00502c47	aef37573-600e-4442-9ae1-63a05799d9a0	approved	4	First real life experiences	2025-12-23 11:14:13.629+01
2e0aebc8-fd4a-4e83-8ac8-397a328ee722	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	520ff5b7-fc08-4c04-bdbb-8de2ad202972	\N	0	paragraph	legacy-backfill	2e0aebc8-fd4a-4e83-8ac8-397a328ee722	aef37573-600e-4442-9ae1-63a05799d9a0	approved	2	as always	2025-12-23 11:14:13.629+01
50ff5c66-de90-428f-a1ec-3e32e2b8bf7f	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	126491a2-b0e9-4ade-80bb-7ced696abeb2	\N	0	paragraph	legacy-backfill	50ff5c66-de90-428f-a1ec-3e32e2b8bf7f	aef37573-600e-4442-9ae1-63a05799d9a0	approved	3	Good and bad	2025-12-23 11:14:13.629+01
3af70f52-2045-4870-a5da-4c22cb2c9c76	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	1028d940-b3ca-4253-b6c3-afd634ff0923	\N	0	paragraph	legacy-backfill	3af70f52-2045-4870-a5da-4c22cb2c9c76	aef37573-600e-4442-9ae1-63a05799d9a0	approved	2	indeed so	2025-12-23 11:14:13.629+01
a76a193c-796c-4b66-a7e4-aeb2ce189ca5	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	b9f1de59-0c10-472f-8174-093d351f0e0c	\N	0	paragraph	legacy-backfill	a76a193c-796c-4b66-a7e4-aeb2ce189ca5	aef37573-600e-4442-9ae1-63a05799d9a0	approved	1	One	2025-12-23 11:14:13.629+01
dc115143-2179-431a-a624-5c6a42f502d3	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	eb752fad-3eae-458a-97c5-6fa67e389bed	\N	0	paragraph	legacy-backfill	dc115143-2179-431a-a624-5c6a42f502d3	aef37573-600e-4442-9ae1-63a05799d9a0	approved	2	indeed so	2025-12-23 11:13:16.439+01
76791185-50b5-43d1-8def-b6daa2ef7eab	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	520ff5b7-fc08-4c04-bdbb-8de2ad202972	\N	0	paragraph	legacy-backfill	76791185-50b5-43d1-8def-b6daa2ef7eab	aef37573-600e-4442-9ae1-63a05799d9a0	approved	2	as always	2025-12-23 11:13:16.439+01
c190ac4c-e808-4396-b5c9-15684939876f	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	44a93f69-03fa-4a4b-8218-c370477362be	\N	0	paragraph	legacy-backfill	c190ac4c-e808-4396-b5c9-15684939876f	aef37573-600e-4442-9ae1-63a05799d9a0	approved	14	I do NOT like it. Here are TOO MANY children... and they are noisy.	2025-12-19 11:58:25.148+01
a5686414-c6c1-49ca-9557-d12116bb6e94	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	44a93f69-03fa-4a4b-8218-c370477362be	\N	0	paragraph	legacy-backfill	a5686414-c6c1-49ca-9557-d12116bb6e94	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	14	I do NOT like it. Here are TOO MANY children... and they are noisy.	2025-12-19 11:57:05.859+01
d188dbbb-771d-466f-be3d-30c1b1066835	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	44a93f69-03fa-4a4b-8218-c370477362be	\N	0	paragraph	legacy-backfill	d188dbbb-771d-466f-be3d-30c1b1066835	aef37573-600e-4442-9ae1-63a05799d9a0	approved	14	I do NOT like it. Here are TOO MANY children... and they are noisy.	2025-12-19 11:56:06.9+01
15aecd40-cf0a-4cbc-8015-08cc9060746d	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	44a93f69-03fa-4a4b-8218-c370477362be	\N	0	paragraph	legacy-backfill	15aecd40-cf0a-4cbc-8015-08cc9060746d	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	14	I do NOT like it. Here are TOO MANY children... and they are noisy.	2025-12-19 11:52:47.971+01
d48e39ef-ce03-4bf4-adc3-f4d53bea13a9	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	e2bac731-67c3-4955-8d9d-83a8a98574ef	\N	0	paragraph	legacy-backfill	d48e39ef-ce03-4bf4-adc3-f4d53bea13a9	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	3	Good and bad	2025-12-19 11:52:47.971+01
63a12e7f-e375-4006-8f57-e3100f42d887	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	44a93f69-03fa-4a4b-8218-c370477362be	\N	0	paragraph	legacy-backfill	63a12e7f-e375-4006-8f57-e3100f42d887	aef37573-600e-4442-9ae1-63a05799d9a0	approved	14	I do NOT like it. Here are TOO MANY children... and they are noisy.	2025-12-19 11:50:57.021+01
608b7d2b-16bc-4ab7-8b6b-4fc6eb4ac51f	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	e2bac731-67c3-4955-8d9d-83a8a98574ef	\N	0	paragraph	legacy-backfill	608b7d2b-16bc-4ab7-8b6b-4fc6eb4ac51f	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	3	Good and bad	2025-12-19 11:37:06.909+01
73340177-e779-47c7-a047-1fc1d61a63e4	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	44a93f69-03fa-4a4b-8218-c370477362be	\N	0	paragraph	legacy-backfill	73340177-e779-47c7-a047-1fc1d61a63e4	aef37573-600e-4442-9ae1-63a05799d9a0	approved	14	I do NOT like it. Here are TOO MANY children... and they are noisy.	2025-12-19 11:27:33.569+01
46175b2e-16c0-480a-bea4-8dee87497e83	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	f3fd75b4-7102-4e30-a757-2eb609398ea6	\N	0	paragraph	legacy-backfill	46175b2e-16c0-480a-bea4-8dee87497e83	aef37573-600e-4442-9ae1-63a05799d9a0	approved	1	One	2025-12-19 11:10:42.353+01
ea9d74b0-a9fb-43d7-a7ab-9ce739296f5e	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	ba894805-d466-4ed5-b6e6-b276f9bbc232	\N	0	paragraph	legacy-backfill	ea9d74b0-a9fb-43d7-a7ab-9ce739296f5e	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	3	New text here	2025-12-19 11:07:03.489+01
298b7b85-c46b-4d9d-ba29-014d7c905129	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	eb752fad-3eae-458a-97c5-6fa67e389bed	\N	0	paragraph	legacy-backfill	298b7b85-c46b-4d9d-ba29-014d7c905129	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	2	indeed so	2025-12-19 11:07:03.489+01
330e90e5-f7ee-47c0-a164-6a1d79e3fa7b	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	4dcdcd7c-b983-422f-8463-3edd7883497a	\N	0	paragraph	legacy-backfill	330e90e5-f7ee-47c0-a164-6a1d79e3fa7b	aef37573-600e-4442-9ae1-63a05799d9a0	approved	2	test text	2025-12-17 14:32:45.956+01
b2249803-b3b4-479b-aeea-8ed0858cb4b6	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	ba894805-d466-4ed5-b6e6-b276f9bbc232	\N	0	paragraph	legacy-backfill	b2249803-b3b4-479b-aeea-8ed0858cb4b6	aef37573-600e-4442-9ae1-63a05799d9a0	approved	2	indeed so	2025-12-17 14:25:58.756+01
8ba2e8c3-97a4-400e-94b9-0d5199dfc5df	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	9c50c0af-3cb5-405d-8502-c8d73feeda34	\N	0	paragraph	legacy-backfill	8ba2e8c3-97a4-400e-94b9-0d5199dfc5df	aef37573-600e-4442-9ae1-63a05799d9a0	approved	5	YEAH, YEah, Yeah... yeah... WTH....	2025-12-16 20:01:34.232+01
122a7812-a88a-4560-b7d8-7cf009d8c031	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	126491a2-b0e9-4ade-80bb-7ced696abeb2	\N	0	paragraph	legacy-backfill	122a7812-a88a-4560-b7d8-7cf009d8c031	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	approved	4	First real life experiences	2025-12-16 19:56:01.99+01
3d6fa31e-ecaf-4975-8933-4dc662ed5d82	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	9c50c0af-3cb5-405d-8502-c8d73feeda34	\N	0	paragraph	legacy-backfill	3d6fa31e-ecaf-4975-8933-4dc662ed5d82	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	5	YEAH, YEan, Yeah... yeah... WTH....	2025-12-16 19:49:54.275+01
dea23ff6-926c-4878-bd47-35ea41385625	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	b9f1de59-0c10-472f-8174-093d351f0e0c	\N	2	paragraph	proposal-backfill	dea23ff6-926c-4878-bd47-35ea41385625	cad23ca1-121d-448f-8947-ddd5048ecb15	undecided	2	Three\n\nFour	2025-12-27 19:41:08.156+01
1b0c0218-c5eb-4e03-b87e-9ee99a4dff90	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	b9f1de59-0c10-472f-8174-093d351f0e0c	\N	1	paragraph	proposal-backfill	1b0c0218-c5eb-4e03-b87e-9ee99a4dff90	cad23ca1-121d-448f-8947-ddd5048ecb15	undecided	2	Beta\nGamma	2025-12-19 11:09:01.879+01
ba8efeb0-b1c9-4697-9f14-30bd1de70b6a	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	b9f1de59-0c10-472f-8174-093d351f0e0c	\N	1	paragraph	proposal-backfill	ba8efeb0-b1c9-4697-9f14-30bd1de70b6a	cad23ca1-121d-448f-8947-ddd5048ecb15	undecided	2	Beta\nGamma	2025-12-19 11:08:41.975+01
c213c3b3-59a3-40e9-8935-a2d0b75bed13	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	eb752fad-3eae-458a-97c5-6fa67e389bed	\N	0	paragraph	proposal-backfill	c213c3b3-59a3-40e9-8935-a2d0b75bed13	cad23ca1-121d-448f-8947-ddd5048ecb15	undecided	6	New text here. One gets excited. 	2025-12-27 19:42:25.906+01
615ce439-5890-4d93-968c-eb8fa8ec267f	7b4cb567-de6c-4728-92d7-56a529c9970f	7fdb3b9a-9cac-4f8f-b73e-75d3d0d489b3	\N	0	paragraph	legacy-backfill	615ce439-5890-4d93-968c-eb8fa8ec267f	aef37573-600e-4442-9ae1-63a05799d9a0	approved	10	test\nand this is just a message from Leo Love \n\n\n\n\n\n\n	2025-12-11 15:43:23.249+01
5d320e88-1080-4f96-a20d-90143f3432c2	7b4cb567-de6c-4728-92d7-56a529c9970f	7fdb3b9a-9cac-4f8f-b73e-75d3d0d489b3	\N	0	paragraph	legacy-backfill	5d320e88-1080-4f96-a20d-90143f3432c2	aef37573-600e-4442-9ae1-63a05799d9a0	approved	10	test\nand this is just a message from Leo Love 	2025-12-11 15:42:05.107+01
\.


--
-- Data for Name: crdt_changes; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.crdt_changes (id, doc_id, actor_id, seq, ts, patch, is_snapshot) FROM stdin;
\.


--
-- Data for Name: crdt_documents; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.crdt_documents (id, doc_key, story_title_id, chapter_id, branch_id, doc_type, is_canonical, owner_user_id, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: crdt_proposals; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.crdt_proposals (id, story_title_id, target_type, target_chapter_id, target_branch_id, target_path, proposed_text, author_user_id, status, decided_by, decided_at, created_at, doc_id) FROM stdin;
ba8efeb0-b1c9-4697-9f14-30bd1de70b6a	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	paragraph	b9f1de59-0c10-472f-8174-093d351f0e0c	\N	1	Beta\nGamma	cad23ca1-121d-448f-8947-ddd5048ecb15	undecided	\N	\N	2025-12-19 11:08:41.975855+01	\N
1b0c0218-c5eb-4e03-b87e-9ee99a4dff90	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	paragraph	b9f1de59-0c10-472f-8174-093d351f0e0c	\N	1	Beta\nGamma	cad23ca1-121d-448f-8947-ddd5048ecb15	undecided	\N	\N	2025-12-19 11:09:01.879772+01	\N
dea23ff6-926c-4878-bd47-35ea41385625	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	paragraph	b9f1de59-0c10-472f-8174-093d351f0e0c	\N	2	Three\n\nFour	cad23ca1-121d-448f-8947-ddd5048ecb15	undecided	\N	\N	2025-12-27 19:41:08.156923+01	\N
c213c3b3-59a3-40e9-8935-a2d0b75bed13	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	paragraph	eb752fad-3eae-458a-97c5-6fa67e389bed	\N	0	New text here. One gets excited. 	cad23ca1-121d-448f-8947-ddd5048ecb15	undecided	\N	\N	2025-12-27 19:42:25.906272+01	\N
\.


--
-- Data for Name: creative_spaces; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.creative_spaces (id, user_id, name, description, path, created_at, updated_at) FROM stdin;
a9bd793c-7d40-44b0-9d17-80992035a51d	agent-test-user	Agent Test Space	\N	\N	2025-12-17 16:09:45.046086+01	2025-12-17 16:09:45.046086+01
46577979-a698-4498-a62a-3de3bc327635	aef37573-600e-4442-9ae1-63a05799d9a0	Veronika	\N	\N	2025-12-17 16:12:20.501201+01	2025-12-17 16:12:20.501201+01
0998becc-cd14-4d39-b8c1-ae77fb9567b8	aef37573-600e-4442-9ae1-63a05799d9a0	Happy Beings	\N	\N	2025-12-17 16:13:01.739209+01	2025-12-17 16:13:01.739209+01
\.


--
-- Data for Name: editable_content; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.editable_content (id, page_path, element_id, content, original_content, updated_by, created_at, updated_at, language) FROM stdin;
65ad9f83-d60e-43f8-a2fe-83611a620923	/profile	about-heading	енм обО	About	e95ec2a3-c9de-4d3c-b516-1998deb243f2	2025-05-05 19:32:46.418774+02	2025-05-05 19:32:46.418774+02	Russian
5d78de4b-b4b5-4bc7-b261-2a9c76197822	/profile	upload-label	акзурнаЩ	Upload	e95ec2a3-c9de-4d3c-b516-1998deb243f2	2025-05-05 19:35:15.686221+02	2025-05-05 19:35:16.021522+02	Russian
ee2f5e30-0629-49d1-9aeb-af66f3ae7bea	/new-story-template	story-subtitle	哦哦哦哦我	of your life	e95ec2a3-c9de-4d3c-b516-1998deb243f2	2025-05-05 20:18:33.093132+02	2025-05-05 20:18:33.093132+02	Chinese
e3c413b5-90d9-4d5e-a951-58a6a3a6cd45	/new-story-template	story-title	 Проверка	Sample story	e95ec2a3-c9de-4d3c-b516-1998deb243f2	2025-05-05 19:39:48.975597+02	2025-05-05 20:28:19.9622+02	Russian
e26f5aa4-fe37-4691-9101-2a07d6160205	/profile	profile-title	ьлифорП	Profile	e95ec2a3-c9de-4d3c-b516-1998deb243f2	2025-05-05 21:16:48.569656+02	2025-05-05 21:16:48.569656+02	Russian
\.


--
-- Data for Name: feature_suggestions; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.feature_suggestions (id, user_id, first_name, last_name, email, telephone, can_contact, contact_method, description, visibility, created_at, attachments) FROM stdin;
8799e3ff-d1d3-415f-9f6a-1c59b43a87fe	\N	\N	\N	\N	\N	f	\N	test	anonymous	2025-05-06 00:29:44.264457+02	[{"id": 1746484164235, "name": "logotype.jpeg", "path": "1746484182280_logotype.jpeg", "type": "jpeg"}]
427b01ae-7b00-4ca0-9cfd-8442b9053d75	\N	Leo	Z			f	\N	Test 2	public	2025-05-06 00:31:20.167665+02	[{"id": 1746484267457, "name": "logotype without border.jpeg", "path": "1746484277144_logotype without border.jpeg", "type": "jpeg"}]
635d16d9-a01f-4639-93bc-fe323b020bf3	\N	\N	\N	\N	\N	t	email	This is a text for a suggestion 	anonymous	2025-05-06 00:39:57.43573+02	[{"id": 1746484440811, "name": "logotype.jpeg", "path": "1746484795214_logotype.jpeg", "type": "jpeg"}, {"id": 1746484449403, "name": "logotype without border.jpeg", "path": "1746484795214_logotype without border.jpeg", "type": "jpeg"}, {"id": 1746484460032, "name": "Untitled 1.pdf", "path": "1746484795214_Untitled 1.pdf", "type": "pdf"}]
\.


--
-- Data for Name: local_users; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.local_users (id, email, password_hash, created_at) FROM stdin;
6f542cd0-551b-4ec9-b2b0-61113dd7af2b	admin@example.com	$2a$10$KF.z26z21tijHZ4CpiEgYerHdvcM06bEMg9pKxEpMxOBAlHz13aDu	2025-12-10 11:00:49.543657+01
cad23ca1-121d-448f-8947-ddd5048ecb15	test@example.com	$2a$10$Q4Zg8NV5Lmvj1ECgFN9YJuw3ko453tXTjnMeE.FuidL7Nd0gnNr.G	2025-12-10 14:12:09.978783+01
aef37573-600e-4442-9ae1-63a05799d9a0	leolove@example.com	$2a$10$wPM5JRiWxBRBZUnbnh4naukM3rAUYflyweAjhnAITafxcloZCE0Fq	2025-12-10 14:12:41.462047+01
\.


--
-- Data for Name: paragraph_branches; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.paragraph_branches (id, chapter_id, parent_paragraph_index, parent_paragraph_text, branch_text, user_id, created_at, language, metadata) FROM stdin;
4a23664a-ee9d-4f4f-931f-f429c26888f8	20c98a0f-5396-47af-982c-c418de96934b	0	test	A new branch	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-16 18:45:30.536088+01	en	\N
4671db61-1757-452f-b7e1-8427cc77d7ff	e2bac731-67c3-4955-8d9d-83a8a98574ef	0	Good and bad		cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-16 19:26:24.0446+01	en	\N
817f7817-82b3-4c82-99d7-7cfdde43a449	44a93f69-03fa-4a4b-8218-c370477362be	0	I do NOT like it	branch	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-16 19:26:27.792295+01	en	\N
\.


--
-- Data for Name: paragraph_revisions; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.paragraph_revisions (id, chapter_id, paragraph_index, prev_paragraph, new_paragraph, created_by, created_at, revision_reason, language, revision_number) FROM stdin;
6a8f5327-5932-4980-a21a-e28e54e0a6ae	7fdb3b9a-9cac-4f8f-b73e-75d3d0d489b3	0	test	test\nand this is just a message from Leo Love 	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-11 15:42:05.111819+01	Paragraph updated	en	1
0273d29b-9dcd-4014-8a2d-2da24539f2cb	7fdb3b9a-9cac-4f8f-b73e-75d3d0d489b3	0	test\nand this is just a message from Leo Love 	test\nand this is just a message from Leo Love \n\n\n\n\n\n\n	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-11 15:43:23.252625+01	Paragraph updated	en	2
6184ba56-0f82-4a3b-8e31-f30da08610d7	8c5e8979-f38f-481d-b6f1-453bff339ef0	0		and this is the thing	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-11 15:45:15.777408+01	Paragraph updated	en	1
493f11e8-eaf3-4f2c-a944-a348dd4a7a9c	c584e977-a1df-4f83-be1b-9d31230b90aa	0	Hello	Hello dear friends	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 10:11:06.429108+01	Paragraph updated	en	1
1f21f1b3-d209-45f5-9ceb-08f7bee998e6	2fa7b19d-207c-4223-8f3c-19b3908f676f	0	dsfhkjhdfjksdhf	Some proper text	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-14 10:12:02.692196+01	Paragraph updated	en	1
f64f1301-3d98-40bb-894a-16a78bd6cc9f	1ec2944b-5ca8-487a-bae0-b0de1e954071	0	Text 2	Text 1	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-14 23:44:36.541795+01	Paragraph updated	en	1
6ceb2aab-7c62-42d0-bc95-d4c62091e55d	126491a2-b0e9-4ade-80bb-7ced696abeb2	1	\N	Let's build that village	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-16 19:56:01.994829+01	Paragraph updated	en	1
fa06952a-867a-42d7-a9f5-a6c365852c83	9c50c0af-3cb5-405d-8502-c8d73feeda34	0	YEAH, YEan, Yeah... yeah... WTH....	YEAH, YEah, Yeah... yeah... WTH....	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-16 20:01:34.234937+01	Paragraph updated	en	1
21586b9e-3c4a-44d2-81a2-43166f280d85	a5a6aecb-c23e-4c86-b9bf-d203ca73f02f	0	Story of my life and other happy occurrences\n	<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0//EN" "http://www.w3.org/TR/REC-html40/strict.dtd">\n<html><head><meta name="qrichtext" content="1" /><meta charset="utf-8" /><style type="text/css">\np, li { white-space: pre-wrap; }\nhr { height: 1px; border-width: 0; }\nli.unchecked::marker { content: "\\2610"; }\nli.checked::marker { content: "\\2612"; }\n</style></head><body style=" font-family:'Ubuntu'; font-size:10pt; font-weight:400; font-style:normal;">\n<h1 style=" margin-top:18px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;"><span style=" font-size:xx-large; font-weight:700;">Story of my wonderful life</span></h1>\n<h2 style=" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;"><span style=" font-size:x-large; font-weight:700;">Chapter 1 - The day I was conceived</span></h2>\n<p style=" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;">Story of my life and other happy occurrences</p>\n<p style=" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;">sasshfjkhskjfhkjsdahf</p>\n<h2 style=" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;"><span style=" font-size:x-large; font-weight:700;">Chapter 2</span></h2>\n<p style=" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;">Text</p>\n<h2 style=" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;"><span style=" font-size:x-large; font-weight:700;">Chapter 3</span></h2>\n<p style=" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;">Hello from admin</p>\n<h2 style=" margin-top:16px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;"><span style=" font-size:x-large; font-weight:700;">Greeting from admin</span></h2>\n<p style=" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;">just a couple of words from the admin of this platform</p>\n<p style=" margin-top:12px; margin-bottom:12px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;">And this should create a new paragraph</p>\n<p style="-qt-paragraph-type:empty; margin-top:0px; margin-bottom:0px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;"><br /></p></body></html>	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:32:07.197304+01	Desktop sync	en	1
cb21b7ca-bfcf-466f-a39e-345a1779a222	533a3846-2682-44c0-bd11-2f3942a0140e	0	And a new chapter's text	And a new chapter's text. Let's extend this text and see if it will be synced into the desktop app	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:56:01.999813+01	Paragraph updated	en	1
9729b43d-d836-4c24-8316-bdf5af8acbaa	ba894805-d466-4ed5-b6e6-b276f9bbc232	0	indeed so	New text here	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:07:03.489811+01	Desktop sync	en	1
b9ee1fa3-424e-483d-bee5-94c7c6422a7c	f3fd75b4-7102-4e30-a757-2eb609398ea6	2	\N	Three	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 11:10:42.357876+01	Paragraph updated	en	1
dbaf1e2d-b091-4fd3-b82e-e45dcfca166c	44a93f69-03fa-4a4b-8218-c370477362be	0	I do NOT like it	I do NOT like it. Here are TOO MANY children... and they are noisy.	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 11:27:33.576071+01	Paragraph updated	en	1
090786bb-83d0-45e2-af97-e2b8b998e5b8	e2bac731-67c3-4955-8d9d-83a8a98574ef	1	Friends and enemies	Friends and enemies\nSchool was ok, till I became teenagr	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:37:06.909053+01	Desktop sync	en	1
e71d1ef8-8d20-4aa2-b844-68270ac4ddcb	44a93f69-03fa-4a4b-8218-c370477362be	1	\N	Let's add something here on the crowdly web before sync in the desktop app is switched ON	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 11:50:57.027008+01	Paragraph updated	en	1
6c68ff30-941a-40e0-84fa-b15d23cc6285	44a93f69-03fa-4a4b-8218-c370477362be	1	Let's add something here on the crowdly web before sync in the desktop app is switched ON	Let's add something here before sync in the desktop app	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:52:47.971815+01	Desktop sync	en	2
068bfc3c-9abc-4e8a-a72f-634d30e6e931	e2bac731-67c3-4955-8d9d-83a8a98574ef	1	Friends and enemies\nSchool was ok, till I became teenagr	Friends and enemies	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:52:47.971815+01	Desktop sync	en	2
90880c1b-e0e2-412d-b621-670eb23b5012	e2bac731-67c3-4955-8d9d-83a8a98574ef	2	\N	School was somewhat ok, till I became teenager	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:52:47.971815+01	Desktop sync	en	1
cd9215d9-f893-411b-9d07-83083f8d89f1	44a93f69-03fa-4a4b-8218-c370477362be	2	\N	Let's add something here on the crowdly web and see if it'll be syn-ed into the desktop app	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 11:56:06.903958+01	Paragraph updated	en	1
60984c29-e327-4c51-9072-211a2daded35	44a93f69-03fa-4a4b-8218-c370477362be	2	Let's add something here on the crowdly web and see if it'll be syn-ed into the desktop app	Let's add something here on the crowdly web and see if it'll be syn-ed into the\ndesktop app	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:57:05.859652+01	Desktop sync	en	2
b535b7e0-8954-4809-8873-50b696156120	44a93f69-03fa-4a4b-8218-c370477362be	3	\N	and now vice versa, if I add something here in the desktop app	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-19 11:57:05.859652+01	Desktop sync	en	1
c2f7d414-c551-4749-94d2-cbf8a6375f76	44a93f69-03fa-4a4b-8218-c370477362be	4	\N	and yes, it has worked out.	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 11:58:25.152504+01	Paragraph updated	en	1
c9f78fdc-b8ef-4a8b-bdab-75c855bc5656	44a93f69-03fa-4a4b-8218-c370477362be	5	\N	It is working. Hurray!	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 11:58:25.155529+01	Paragraph updated	en	1
20c087e7-a807-427b-81b4-c34fb033e1e5	520ff5b7-fc08-4c04-bdbb-8de2ad202972	1	\N	**It takes a village to raise a child**	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:13:16.439678+01	Desktop sync	en	1
dc3ef99d-c10a-4f75-a275-0d66e9f21a5b	520ff5b7-fc08-4c04-bdbb-8de2ad202972	2	\N	indeed so	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:13:16.439678+01	Desktop sync	en	1
a53a9224-3189-453f-bcb0-ea0750eb62d3	eb752fad-3eae-458a-97c5-6fa67e389bed	1	\N	now it is us who need to find that village	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:13:16.439678+01	Desktop sync	en	1
16203c4f-366c-467c-b491-120a74ecdfb3	44a93f69-03fa-4a4b-8218-c370477362be	0	I do NOT like it. Here are TOO MANY children... and they are noisy.	indeed so	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	2
aa25ec82-2197-4427-92fe-b3916f000890	e2bac731-67c3-4955-8d9d-83a8a98574ef	0	Good and bad	I do NOT like it. Here are TOO MANY children... and they are noisy.	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
e17983e6-1811-4c59-a7bf-ffbbaa616371	e2bac731-67c3-4955-8d9d-83a8a98574ef	1	Friends and enemies	Let's add something here before sync in the desktop app	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	3
14f2f0f4-b208-425e-a6be-b0be8fc32136	e2bac731-67c3-4955-8d9d-83a8a98574ef	2	School was somewhat ok, till I became teenager	Let's add something here on the crowdly web and see if it'll be syn-ed into the\ndesktop app	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	2
ae715835-538a-4870-83f6-7446153b2357	e2bac731-67c3-4955-8d9d-83a8a98574ef	3	\N	and now vice versa, if I add something here in the desktop app	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
f85ac7a9-4ed5-4a83-92a6-52bbcd2cfd37	e2bac731-67c3-4955-8d9d-83a8a98574ef	4	\N	and yes, it has worked out.	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
a2aa29cb-5b71-40bc-b76e-6bfdd99bebc7	e2bac731-67c3-4955-8d9d-83a8a98574ef	5	\N	It is working. Hurray!	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
4e497a14-5534-40b3-9ca8-1e22b3c4c1ea	126491a2-b0e9-4ade-80bb-7ced696abeb2	0	First real life experiences	Good and bad	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
ea826255-a499-4f99-8542-070b0551d604	126491a2-b0e9-4ade-80bb-7ced696abeb2	1	Let's build that village	Friends and enemies	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	2
6d690a2e-cfbb-4803-b22b-39d1201e9ba6	126491a2-b0e9-4ade-80bb-7ced696abeb2	2	\N	School was somewhat ok, till I became teenager	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
01e47207-a1e0-4daa-a967-dc1ef6c395aa	f3fd75b4-7102-4e30-a757-2eb609398ea6	0	One	First real life experiences	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
78a24c3f-0607-4e43-bdbf-17361e2fd60b	f3fd75b4-7102-4e30-a757-2eb609398ea6	1	Two	Let's build that village	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
a17a97b0-5d88-4a0a-bd21-f0afd6c055bd	b9f1de59-0c10-472f-8174-093d351f0e0c	0	Alpha	One	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
faca475b-7b7b-4d33-8e91-33bddbfc5b85	b9f1de59-0c10-472f-8174-093d351f0e0c	1	Beta	Two	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
76598992-36df-4361-bc35-3f4ab73de59e	b9f1de59-0c10-472f-8174-093d351f0e0c	2	\N	Three	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
b6e0a843-4509-4a53-9e40-f4aad8de7e17	9c50c0af-3cb5-405d-8502-c8d73feeda34	0	YEAH, YEah, Yeah... yeah... WTH....	Alpha	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	2
424f7cea-4c4b-4445-bdf4-2860fd0a085e	9c50c0af-3cb5-405d-8502-c8d73feeda34	1	\N	Beta	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
53295775-713c-433f-9b36-bf0870007753	ba894805-d466-4ed5-b6e6-b276f9bbc232	0	New text here	YEAH, YEah, Yeah... yeah... WTH....	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	2
a7a425fd-3720-4ea5-8d9d-11a3ab5e1392	eb752fad-3eae-458a-97c5-6fa67e389bed	0	indeed so	New text here	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:14:13.629506+01	Desktop sync	en	1
75b5d0b1-f2fb-4c27-bcb6-d866597e7255	44a93f69-03fa-4a4b-8218-c370477362be	1	\N	Today on 23. December I add some changes on Crowdly web to see if the changes will be syn-ed into the desktop app 11:36 is the local time here in Munich	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-23 11:36:48.46012+01	Paragraph updated	en	3
92d14b87-e27a-4871-b21a-f143b6c9ec91	44a93f69-03fa-4a4b-8218-c370477362be	1	Today on 23. December I add some changes on Crowdly web to see if the changes will be syn-ed into the desktop app 11:36 is the local time here in Munich	Today on 23. December I add some changes on Crowdly web to see if the changes\nwill be syn-ed into the desktop app 11:36 is the local time here in Munich	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-23 11:39:51.722611+01	Desktop sync	en	4
294b1db7-75b0-4e48-b223-e0219479f2a5	1028d940-b3ca-4253-b6c3-afd634ff0923	2	\N	Now I'm adding another paragraph in the desktop app as the user test to see the\nbehaviour of both desktop app and Crowdly web	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-23 11:39:51.722611+01	Desktop sync	en	1
a9507774-16eb-4e17-8e48-7a88d1d31768	ac1f9d6b-85ca-4aed-b833-0d39e7f72111	1	\N	I'm making changes to the story with the story ID\nhttp://localhost:8080/story/263cffb0-1899-44b9-8e2d-581114963274 in the desktop\napp to see the behaviour	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-23 12:12:53.237302+01	Desktop sync	en	1
911ae84c-2d40-4d1e-8711-7950e537d43d	2fa7b19d-207c-4223-8f3c-19b3908f676f	1	\N	and now I'm making changes on the Crowdly web platform to see if the changes will be sync-ed into the desktop app for the user test	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-23 12:14:16.369526+01	Paragraph updated	en	1
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.profiles (id, username, created_at, updated_at, first_name, last_name, nickname, about, bio, interests, profile_image_url, birthday, languages, social_facebook, social_snapchat, social_instagram, social_other, telephone, notify_phone, notify_app, notify_email) FROM stdin;
61f38d4e-60a7-4836-9f43-1dfe7ddd00e7	leoforce@example.com	2025-05-05 17:37:32.335628+02	2025-05-05 17:37:32.335628+02	\N	\N	\N	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	t	t
e95ec2a3-c9de-4d3c-b516-1998deb243f2	leolove@example.com	2025-05-05 18:21:13.488887+02	2025-05-05 18:21:13.488887+02	\N	\N	\N	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	t	t
4b1454d7-f26c-4485-9e3f-614c92dcd0ae	leoforce@crowdly.org	2025-06-15 15:51:07.942667+02	2025-06-15 15:51:07.942667+02	\N	\N	\N	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	t	t
e28cf50b-29ce-4486-b1e6-085882b6dbe9	leoforce@growdly.online	2025-05-05 18:37:05.47367+02	2025-05-05 18:37:05.47367+02	Leo	Force	\N	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	f	f
aef37573-600e-4442-9ae1-63a05799d9a0	leolove@example.com-aef37573	2025-12-17 16:58:44.976518+01	2025-12-17 17:00:43.162754+01	Leo	Love	\N	\N	My name is Love, Leo Love :)	{}	\N	1980-08-09	{}	\N	\N	\N	\N	\N	f	t	t
cad23ca1-121d-448f-8947-ddd5048ecb15	test@example.com	2025-12-17 17:14:34.761162+01	2025-12-17 17:14:34.761162+01	\N	\N	\N	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	t	t
6f542cd0-551b-4ec9-b2b0-61113dd7af2b	admin@example.com	2025-12-18 14:14:36.218696+01	2025-12-18 14:14:36.218696+01	\N	\N	\N	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	t	t
\.


--
-- Data for Name: reactions; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.reactions (id, user_id, story_title_id, chapter_id, paragraph_index, reaction_type, created_at) FROM stdin;
\.


--
-- Data for Name: stories; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.stories (chapter_id, story_title_id, chapter_title, paragraphs, created_at, updated_at, contribution_status, contributor_id, episode_number, part_number, chapter_index) FROM stdin;
cc905c20-8f21-4de2-9518-104c54532fc9	7c07adb7-deb0-405e-8589-9954cd33edce	Intro	{"This book ...."}	2025-06-15 15:27:19.296802+02	2025-06-15 15:27:19.296802+02	undecided	\N	\N	\N	1
001f4952-499c-4ee8-804e-de4858ee47c2	7c07adb7-deb0-405e-8589-9954cd33edce	Becoming	{"It was the most fabulous time"}	2025-06-15 16:32:24.387939+02	2025-06-15 16:32:24.387939+02	undecided	\N	\N	\N	1
025d06b1-24b3-4873-8c65-fed3546603b6	7c07adb7-deb0-405e-8589-9954cd33edce	And one day it happened	{"I was on the way to"}	2025-06-15 17:07:43.975812+02	2025-06-15 17:07:43.975812+02	undecided	\N	\N	\N	1
d4568e80-fe90-4e1f-84ab-0ac8956ea737	7c07adb7-deb0-405e-8589-9954cd33edce	Bu ga ga	{"What was that?"}	2025-06-15 17:18:40.371893+02	2025-06-15 17:18:40.371893+02	undecided	\N	\N	\N	1
d31c6849-de2e-4969-bbbe-35ad49c2ca8e	e0f7de55-1d13-42c1-aecc-e0338ea81152	Chapter 1 - The day I was conceived	{"Привет "}	2025-12-10 12:34:01.715435+01	2025-12-10 12:34:01.715435+01	undecided	\N	\N	\N	1
ac6c9545-fcfc-48b5-9d5c-f353a4e49eb5	ab1c8307-21cd-49c3-b236-c05db1eeaa45	Chapter 3	{"Hello from admin"}	2025-12-19 10:54:50.291524+01	2025-12-19 10:54:50.291524+01	undecided	\N	\N	\N	5
5f767c94-e81c-4f2b-b98c-59c7715fc2fe	19065447-aaf0-4e4f-8847-0869de1be7dd	Test 2	{"Test 2"}	2025-12-14 14:59:19.210025+01	2025-12-14 14:59:19.210025+01	undecided	\N	\N	\N	1
7fdb3b9a-9cac-4f8f-b73e-75d3d0d489b3	7b4cb567-de6c-4728-92d7-56a529c9970f	Chapter 1 - The day I was conceived	{"test\nand this is just a message from Leo Love \n\n\n\n\n\n\n"}	2025-12-10 13:36:45.724303+01	2025-12-10 13:36:45.724303+01	undecided	\N	\N	\N	1
8c5e8979-f38f-481d-b6f1-453bff339ef0	e0f7de55-1d13-42c1-aecc-e0338ea81152	Chapter 2 - I was born	{"and this is the thing"}	2025-12-10 12:35:14.767358+01	2025-12-10 12:35:14.767358+01	undecided	\N	\N	\N	1
914efa1d-c60d-4e02-8b3c-5d13b2cf4de4	751c6c7b-d272-4853-b982-db29b911facc	The day I was born	{"It was a nice clear day. No clouds on the sky were to be seen. It was such a nice day."}	2025-12-14 15:01:13.256649+01	2025-12-14 15:01:13.256649+01	undecided	\N	\N	\N	1
c584e977-a1df-4f83-be1b-9d31230b90aa	acab0a30-9f2c-423a-ad82-e86ab2818a01	Intro	{"Hello dear friends"}	2025-12-10 13:34:38.554488+01	2025-12-10 13:34:38.554488+01	undecided	\N	\N	\N	1
27c3e162-d103-463d-8a62-862fdf9ae0fb	fb654feb-8547-4c58-8ba6-e11be576b846	Chapter 1 - The day I was conceived/new-story-template	{}	2025-12-14 13:50:53.989809+01	2025-12-14 13:50:53.989809+01	undecided	\N	\N	\N	1
d827937a-cd68-43d1-bf0f-9baf306c08e8	84452f69-b0eb-478e-aa31-938a35ec6912	The day I was conceived	{}	2025-12-14 13:59:32.373146+01	2025-12-14 13:59:32.373146+01	undecided	\N	\N	\N	1
a8197968-c852-40d2-b471-a00fee60c892	7a201a20-c9d7-41ad-8a04-09a4a3bd82bd	The day I was conceived	{Text}	2025-12-14 14:02:52.173353+01	2025-12-14 14:02:52.173353+01	undecided	\N	\N	\N	1
0e0c69e3-157f-4142-b5e8-a8e2d0e26f2e	a6c76f24-d604-4ed2-8b83-74b5640df229	The day I was conceived	{text}	2025-12-14 14:04:07.489924+01	2025-12-14 14:04:07.489924+01	undecided	\N	\N	\N	1
400d2619-93a3-44bc-b5a0-dff34d10040e	751c6c7b-d272-4853-b982-db29b911facc	The day I was conceived	{text}	2025-12-14 14:05:10.181065+01	2025-12-14 14:05:10.181065+01	undecided	\N	\N	\N	1
8e828011-3bdb-422c-88c6-defa14dedd5e	0bef9edd-18fd-4e1c-aa57-5ef9f8788ba9	The day I was conceived	{dskfskejgksödhagjkdhgjkag}	2025-12-14 14:13:34.526026+01	2025-12-14 14:13:34.526026+01	undecided	\N	\N	\N	1
20c98a0f-5396-47af-982c-c418de96934b	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	The day I was conceived	{test}	2025-12-14 14:05:33.645236+01	2025-12-14 14:05:33.645236+01	undecided	\N	\N	\N	1
89b7ed37-0855-4b09-94de-5536f1e3a37c	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	The day I was born	{"was an amazing one."}	2025-12-16 18:41:58.008491+01	2025-12-16 18:41:58.008491+01	undecided	\N	\N	\N	2
4dcdcd7c-b983-422f-8463-3edd7883497a	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Test chapter	{"test text"}	2025-12-17 14:32:45.938035+01	2025-12-17 14:32:45.938035+01	undecided	\N	\N	\N	3
5b9bd5d9-6d05-4b42-837b-95f1b08e9295	e1ab0869-1759-441e-892d-de376789149b	The day I was conceived	{"PLa PLa Pla",Test,sfkdklsjfk,safksjkhfjshfjkhdsjkgh,"Another test"}	2025-12-14 14:35:07.685379+01	2025-12-14 14:35:07.685379+01	undecided	\N	\N	\N	1
44a93f69-03fa-4a4b-8218-c370477362be	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	It takes a village to raise a child	{"indeed so","Today on 23. December I add some changes on Crowdly web to see if the changes\nwill be syn-ed into the desktop app 11:36 is the local time here in Munich"}	2025-12-16 18:43:55.514075+01	2025-12-16 18:43:55.514075+01	undecided	\N	\N	\N	5
1ec2944b-5ca8-487a-bae0-b0de1e954071	19065447-aaf0-4e4f-8847-0869de1be7dd	Test 1	{"Text 1"}	2025-12-14 14:58:44.687616+01	2025-12-14 14:58:44.687616+01	undecided	\N	\N	\N	1
8e3f08fd-8393-4f70-ac20-1fc36958dff8	ab1c8307-21cd-49c3-b236-c05db1eeaa45	Greeting from admin	{"just a couple of words from the admin of this platform","And this should create a new paragraph"}	2025-12-19 10:54:50.291524+01	2025-12-19 10:54:50.291524+01	undecided	\N	\N	\N	6
a5a6aecb-c23e-4c86-b9bf-d203ca73f02f	ab1c8307-21cd-49c3-b236-c05db1eeaa45	Chapter	{}	2025-12-10 14:32:23.583943+01	2025-12-10 14:32:23.583943+01	undecided	\N	\N	\N	1
09a6b999-b8f0-4884-8bfe-f011ada44aaa	ab1c8307-21cd-49c3-b236-c05db1eeaa45	Chapter	{"# Story of my wonderful life"}	2025-12-19 10:54:50.291524+01	2025-12-19 10:54:50.291524+01	undecided	\N	\N	\N	2
ac1f9d6b-85ca-4aed-b833-0d39e7f72111	263cffb0-1899-44b9-8e2d-581114963274	Test	{test,"I'm making changes to the story with the story ID\nhttp://localhost:8080/story/263cffb0-1899-44b9-8e2d-581114963274 in the desktop\napp to see the behaviour"}	2025-12-14 13:13:52.258666+01	2025-12-14 13:13:52.258666+01	undecided	\N	\N	\N	2
2fa7b19d-207c-4223-8f3c-19b3908f676f	263cffb0-1899-44b9-8e2d-581114963274	The day I was conceived	{"Some proper text","and now I'm making changes on the Crowdly web platform to see if the changes will be sync-ed into the desktop app for the user test"}	2025-12-10 13:54:58.980704+01	2025-12-10 13:54:58.980704+01	undecided	\N	\N	\N	1
193ace2d-2766-46b7-852d-762e30cc590f	ab1c8307-21cd-49c3-b236-c05db1eeaa45	Chapter 1 - The day I was conceived	{"Story of my life and other happy occurrences",sasshfjkhskjfhkjsdahf}	2025-12-19 10:54:50.291524+01	2025-12-19 10:54:50.291524+01	undecided	\N	\N	\N	3
4b9abf5d-447c-47e5-8ad9-461675c08a71	ab1c8307-21cd-49c3-b236-c05db1eeaa45	Chapter 2	{Text}	2025-12-19 10:54:50.291524+01	2025-12-19 10:54:50.291524+01	undecided	\N	\N	\N	4
533a3846-2682-44c0-bd11-2f3942a0140e	ab1c8307-21cd-49c3-b236-c05db1eeaa45	New chapter	{"And a new chapter's text. Let's extend this text and see if it will be synced into the desktop app"}	2025-12-19 10:54:50.291524+01	2025-12-19 10:54:50.291524+01	undecided	\N	\N	\N	7
520ff5b7-fc08-4c04-bdbb-8de2ad202972	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	And life goes on	{"as always"}	2025-12-16 18:42:57.147972+01	2025-12-16 18:42:57.147972+01	undecided	\N	\N	\N	4
e2bac731-67c3-4955-8d9d-83a8a98574ef	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Kindergarten	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here before sync in the desktop app","Let's add something here on the crowdly web and see if it'll be syn-ed into the\ndesktop app","and now vice versa, if I add something here in the desktop app","and yes, it has worked out.","It is working. Hurray!"}	2025-12-16 19:02:17.755015+01	2025-12-16 19:02:17.755015+01	undecided	\N	\N	\N	6
126491a2-b0e9-4ade-80bb-7ced696abeb2	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	School	{"Good and bad","Friends and enemies","School was somewhat ok, till I became teenager"}	2025-12-16 19:26:24.041234+01	2025-12-16 19:26:24.041234+01	undecided	\N	\N	\N	7
f3fd75b4-7102-4e30-a757-2eb609398ea6	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	College	{"First real life experiences","Let's build that village"}	2025-12-16 19:37:52.220708+01	2025-12-16 19:37:52.220708+01	undecided	\N	\N	\N	8
b9f1de59-0c10-472f-8174-093d351f0e0c	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Test from API 2	{One,Two,Three}	2025-12-16 19:38:53.263346+01	2025-12-16 19:38:53.263346+01	undecided	\N	\N	\N	9
9c50c0af-3cb5-405d-8502-c8d73feeda34	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Test from API 3	{Alpha,Beta}	2025-12-16 19:49:54.264191+01	2025-12-16 19:49:54.264191+01	undecided	\N	\N	\N	10
ba894805-d466-4ed5-b6e6-b276f9bbc232	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Adult life	{"YEAH, YEah, Yeah... yeah... WTH...."}	2025-12-17 14:25:58.743404+01	2025-12-17 14:25:58.743404+01	undecided	\N	\N	\N	11
eb752fad-3eae-458a-97c5-6fa67e389bed	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	When one meest her	{"New text here"}	2025-12-19 11:07:03.489811+01	2025-12-19 11:07:03.489811+01	undecided	\N	\N	\N	12
1028d940-b3ca-4253-b6c3-afd634ff0923	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	It takes a village to raise a child, again	{"indeed so","now it is us who need to find that village","Now I'm adding another paragraph in the desktop app as the user test to see the\nbehaviour of both desktop app and Crowdly web"}	2025-12-23 11:14:13.629506+01	2025-12-23 11:14:13.629506+01	undecided	\N	\N	\N	13
\.


--
-- Data for Name: story_access; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.story_access (story_title_id, user_id, role, created_at) FROM stdin;
fb654feb-8547-4c58-8ba6-e11be576b846	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2025-12-14 13:50:54.003636+01
84452f69-b0eb-478e-aa31-938a35ec6912	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2025-12-14 13:59:32.383247+01
7a201a20-c9d7-41ad-8a04-09a4a3bd82bd	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2025-12-14 14:02:52.190615+01
a6c76f24-d604-4ed2-8b83-74b5640df229	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2025-12-14 14:04:07.496316+01
751c6c7b-d272-4853-b982-db29b911facc	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2025-12-14 14:05:10.18647+01
afc0ca9b-5a67-46a0-b01c-9da9d27ae642	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2025-12-14 14:05:33.658673+01
0bef9edd-18fd-4e1c-aa57-5ef9f8788ba9	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2025-12-14 14:13:34.541524+01
19065447-aaf0-4e4f-8847-0869de1be7dd	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2025-12-14 14:14:40.37866+01
e1ab0869-1759-441e-892d-de376789149b	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2025-12-14 14:35:07.685379+01
afc0ca9b-5a67-46a0-b01c-9da9d27ae642	cad23ca1-121d-448f-8947-ddd5048ecb15	contributor	2025-12-16 19:49:54.27235+01
ab1c8307-21cd-49c3-b236-c05db1eeaa45	aef37573-600e-4442-9ae1-63a05799d9a0	contributor	2025-12-19 10:54:50.291524+01
\.


--
-- Data for Name: story_attributes; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.story_attributes (id, story_id, story_creator, story_contributors, new, most_popular, most_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: story_initiators; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.story_initiators (creator_id, initiator_id, created_at, updated_at) FROM stdin;
aef37573-600e-4442-9ae1-63a05799d9a0	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:32:07.197304+01	2025-12-23 11:39:51.722611+01
6f542cd0-551b-4ec9-b2b0-61113dd7af2b	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-23 12:12:53.237302+01	2025-12-23 12:12:53.237302+01
\.


--
-- Data for Name: story_title; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.story_title (story_title_id, title, created_at, updated_at, creator_id, visibility, published, genre, tags) FROM stdin;
d46656f3-b361-4acc-b36a-023bf97707bd	Love story 2	2025-06-15 15:09:53.239137+02	2025-06-15 15:09:53.239137+02	e28cf50b-29ce-4486-b1e6-085882b6dbe9	public	t	\N	\N
c88b45d6-f4ca-4646-b998-2b101e9ea937	Yet another story	2025-06-15 15:15:24.933726+02	2025-06-15 15:15:24.933726+02	e28cf50b-29ce-4486-b1e6-085882b6dbe9	public	t	\N	\N
7c07adb7-deb0-405e-8589-9954cd33edce	Yet another great Story of my LOVE life	2025-06-15 15:26:36.329198+02	2025-06-15 15:26:36.329198+02	e28cf50b-29ce-4486-b1e6-085882b6dbe9	public	t	\N	\N
e0f7de55-1d13-42c1-aecc-e0338ea81152	Story of my life	2025-12-10 12:34:01.715435+01	2025-12-10 12:34:01.715435+01	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	public	t	\N	\N
7b4cb567-de6c-4728-92d7-56a529c9970f	Story of my life (edited)	2025-12-10 13:36:45.724303+01	2025-12-10 13:36:45.724303+01	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	public	t	\N	\N
acab0a30-9f2c-423a-ad82-e86ab2818a01	Test Story	2025-12-10 13:34:38.554488+01	2025-12-10 13:34:38.554488+01	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	public	t	\N	\N
fb654feb-8547-4c58-8ba6-e11be576b846	Story of my life	2025-12-14 13:50:53.989809+01	2025-12-14 13:50:53.989809+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N
84452f69-b0eb-478e-aa31-938a35ec6912	Story of my life	2025-12-14 13:59:32.373146+01	2025-12-14 13:59:32.373146+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N
7a201a20-c9d7-41ad-8a04-09a4a3bd82bd	Story of my life	2025-12-14 14:02:52.173353+01	2025-12-14 14:02:52.173353+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N
a6c76f24-d604-4ed2-8b83-74b5640df229	Story of my life	2025-12-14 14:04:07.489924+01	2025-12-14 14:04:07.489924+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N
751c6c7b-d272-4853-b982-db29b911facc	Story of my life	2025-12-14 14:05:10.181065+01	2025-12-14 14:05:10.181065+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N
0bef9edd-18fd-4e1c-aa57-5ef9f8788ba9	Story of my life	2025-12-14 14:13:34.526026+01	2025-12-14 14:13:34.526026+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N
19065447-aaf0-4e4f-8847-0869de1be7dd	Story of my life	2025-12-14 14:14:40.364576+01	2025-12-14 14:14:40.364576+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N
e1ab0869-1759-441e-892d-de376789149b	Story of my life	2025-12-14 14:35:07.685379+01	2025-12-14 14:35:07.685379+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N
ab1c8307-21cd-49c3-b236-c05db1eeaa45	Untitled	2025-12-10 14:32:23.583943+01	2025-12-10 14:32:23.583943+01	aef37573-600e-4442-9ae1-63a05799d9a0	private	t	\N	\N
263cffb0-1899-44b9-8e2d-581114963274	Story of my amazing life	2025-12-10 13:54:58.980704+01	2025-12-23 12:14:16.371036+01	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	public	t	\N	\N
afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Currently, the most active story	2025-12-14 14:05:33.645236+01	2025-12-23 11:39:51.722611+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N
\.


--
-- Data for Name: story_title_revisions; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.story_title_revisions (id, story_title_id, prev_title, new_title, created_by, created_at, revision_reason, language, revision_number) FROM stdin;
7a3eaac5-3269-43db-89aa-2d1ff7989090	d46656f3-b361-4acc-b36a-023bf97707bd	\N	Love story 2	e28cf50b-29ce-4486-b1e6-085882b6dbe9	2025-06-15 15:09:53.578022+02	Initial creation	en	1
d1ec6e94-eef1-44ac-adbb-8c21ab4fa7cf	c88b45d6-f4ca-4646-b998-2b101e9ea937	\N	Yet another story	e28cf50b-29ce-4486-b1e6-085882b6dbe9	2025-06-15 15:15:25.18034+02	Initial creation	en	1
49478955-d91e-4f1f-b7ad-c4376c489867	7c07adb7-deb0-405e-8589-9954cd33edce	\N	Yet another great Story of my LOVE life	e28cf50b-29ce-4486-b1e6-085882b6dbe9	2025-06-15 15:26:36.606967+02	Initial creation	en	1
5faa720d-ca74-4a92-a061-2456d846fe99	e0f7de55-1d13-42c1-aecc-e0338ea81152	\N	Story of my life	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-10 12:34:01.715435+01	Initial creation	en	1
725eb51b-6f93-4dc5-a66d-c2e5b31d51f2	acab0a30-9f2c-423a-ad82-e86ab2818a01	\N	Test Story From Curl	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-10 13:34:38.554488+01	Initial creation	en	1
350c4d5d-478c-4329-93c0-20f93bb2be25	7b4cb567-de6c-4728-92d7-56a529c9970f	\N	Story of my life	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-10 13:36:45.724303+01	Initial creation	en	1
3ec8054d-fdbe-4be0-8726-1da12fef2815	7b4cb567-de6c-4728-92d7-56a529c9970f	Story of my life	Story of my life (edited)	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-10 13:43:05.760787+01	Manual update	en	2
c8a24694-c83f-43f5-b29f-2324b0ce4fd2	263cffb0-1899-44b9-8e2d-581114963274	\N	Story of my life	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-10 13:54:58.980704+01	Initial creation	en	1
6f45d07e-5828-429a-bae4-ce946f28ed8b	263cffb0-1899-44b9-8e2d-581114963274	Story of my life	Story of my amazing life	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-10 13:55:20.929743+01	Manual update	en	2
24630fb5-9c4b-4182-b65e-2e4d6e6e6494	ab1c8307-21cd-49c3-b236-c05db1eeaa45	\N	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-10 14:32:23.583943+01	Initial creation	en	1
d5ace875-471e-4087-9b65-01c40c8faac0	ab1c8307-21cd-49c3-b236-c05db1eeaa45	Story of my life	Story of my wonderful life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-10 15:08:58.20922+01	Manual update	en	2
2d650a7c-d700-4d77-b158-19c7c2385608	acab0a30-9f2c-423a-ad82-e86ab2818a01	Test Story From Curl	Test Story	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 10:10:21.033166+01	Manual update	en	2
bdd752d8-ca92-4d68-a5cb-fed8452a2f6e	fb654feb-8547-4c58-8ba6-e11be576b846	\N	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 13:50:53.989809+01	Initial creation	en	1
180670bd-4e18-429a-951c-bc057d784eb4	84452f69-b0eb-478e-aa31-938a35ec6912	\N	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 13:59:32.373146+01	Initial creation	en	1
2a7c229c-3602-4d50-956c-64f10b936e8f	7a201a20-c9d7-41ad-8a04-09a4a3bd82bd	\N	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:02:52.173353+01	Initial creation	en	1
213be25e-4ad4-4fff-bbf2-9f887043f9d4	7a201a20-c9d7-41ad-8a04-09a4a3bd82bd	Story of my life	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:02:59.951408+01	Manual update	en	2
c4697d68-f31e-47a2-8db5-b858c29107f6	a6c76f24-d604-4ed2-8b83-74b5640df229	\N	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:04:07.489924+01	Initial creation	en	1
e24a4bea-70b9-4310-84b5-cbd4a7d00e60	a6c76f24-d604-4ed2-8b83-74b5640df229	Story of my life	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:04:16.647085+01	Manual update	en	2
a3d94bbc-c97d-4f40-af30-3856e2de0e4f	751c6c7b-d272-4853-b982-db29b911facc	\N	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:05:10.181065+01	Initial creation	en	1
3b3f2626-5781-4b66-aa2a-fbf940b826a9	751c6c7b-d272-4853-b982-db29b911facc	Story of my life	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:05:14.797015+01	Manual update	en	2
75defbac-6d3b-4cb3-9bbf-97b34c13f521	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:05:33.645236+01	Initial creation	en	1
feec1253-59ad-435c-89b3-a66c2d05ae67	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Story of my life	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:05:41.470987+01	Manual update	en	2
55b5604c-cb8b-4a77-88f2-285c6b88f50a	0bef9edd-18fd-4e1c-aa57-5ef9f8788ba9	\N	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:13:34.526026+01	Initial creation	en	1
e764cd7d-9c09-48df-a7c7-ccc7487af2d9	0bef9edd-18fd-4e1c-aa57-5ef9f8788ba9	Story of my life	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:13:43.120085+01	Manual update	en	2
0626c0b7-47bf-4d93-bb70-7563c191f3c7	19065447-aaf0-4e4f-8847-0869de1be7dd	\N	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:14:40.364576+01	Initial creation	en	1
e6c997ae-6413-4ada-989d-fc0fd86218fa	e1ab0869-1759-441e-892d-de376789149b	\N	Story of my life	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-14 14:35:07.685379+01	Cloned from story 19065447-aaf0-4e4f-8847-0869de1be7dd	en	1
0544949a-f686-4bbe-abf5-313e34ccd301	ab1c8307-21cd-49c3-b236-c05db1eeaa45	Story of my wonderful life	Untitled	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:32:07.197304+01	Desktop sync	en	3
09ba5277-17dc-4a11-af76-09a3110844e9	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Story of my life	Currently, the most active story	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-28 14:44:57.46638+01	Manual update	en	3
\.


--
-- Data for Name: subscribers; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.subscribers (id, first_name, last_name, email, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.user_roles (id, user_id, role) FROM stdin;
e42050a2-9a7f-4464-b37c-47db8d367878	61f38d4e-60a7-4836-9f43-1dfe7ddd00e7	platform_admin
c81e1ab8-b830-4be7-864c-bb1a70c32794	e95ec2a3-c9de-4d3c-b516-1998deb243f2	platform_admin
f6dfca32-f9cb-4913-859b-638b0a080d48	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	platform_admin
518af929-6626-4b53-bbf9-c98b0af36be3	cad23ca1-121d-448f-8947-ddd5048ecb15	consumer
585c2d43-cd6b-4d2b-a97c-c950219ca0af	aef37573-600e-4442-9ae1-63a05799d9a0	consumer
\.


--
-- Name: crdt_changes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: lad
--

SELECT pg_catalog.setval('public.crdt_changes_id_seq', 1, false);


--
-- Name: authors authors_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_pkey PRIMARY KEY (creator_id);


--
-- Name: chapter_comments chapter_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.chapter_comments
    ADD CONSTRAINT chapter_comments_pkey PRIMARY KEY (id);


--
-- Name: chapter_contributors chapter_contributors_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.chapter_contributors
    ADD CONSTRAINT chapter_contributors_pkey PRIMARY KEY (id);


--
-- Name: chapter_likes chapter_likes_chapter_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.chapter_likes
    ADD CONSTRAINT chapter_likes_chapter_id_user_id_key UNIQUE (chapter_id, user_id);


--
-- Name: chapter_likes chapter_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.chapter_likes
    ADD CONSTRAINT chapter_likes_pkey PRIMARY KEY (id);


--
-- Name: chapter_revisions chapter_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.chapter_revisions
    ADD CONSTRAINT chapter_revisions_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: contributions contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_pkey PRIMARY KEY (id);


--
-- Name: crdt_changes crdt_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_changes
    ADD CONSTRAINT crdt_changes_pkey PRIMARY KEY (id);


--
-- Name: crdt_documents crdt_documents_doc_key_key; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_documents
    ADD CONSTRAINT crdt_documents_doc_key_key UNIQUE (doc_key);


--
-- Name: crdt_documents crdt_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_documents
    ADD CONSTRAINT crdt_documents_pkey PRIMARY KEY (id);


--
-- Name: crdt_proposals crdt_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_proposals
    ADD CONSTRAINT crdt_proposals_pkey PRIMARY KEY (id);


--
-- Name: creative_spaces creative_spaces_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.creative_spaces
    ADD CONSTRAINT creative_spaces_pkey PRIMARY KEY (id);


--
-- Name: editable_content editable_content_page_path_element_id_key; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.editable_content
    ADD CONSTRAINT editable_content_page_path_element_id_key UNIQUE (page_path, element_id);


--
-- Name: editable_content editable_content_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.editable_content
    ADD CONSTRAINT editable_content_pkey PRIMARY KEY (id);


--
-- Name: feature_suggestions feature_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.feature_suggestions
    ADD CONSTRAINT feature_suggestions_pkey PRIMARY KEY (id);


--
-- Name: local_users local_users_email_key; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT local_users_email_key UNIQUE (email);


--
-- Name: local_users local_users_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.local_users
    ADD CONSTRAINT local_users_pkey PRIMARY KEY (id);


--
-- Name: paragraph_branches paragraph_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.paragraph_branches
    ADD CONSTRAINT paragraph_branches_pkey PRIMARY KEY (id);


--
-- Name: paragraph_revisions paragraph_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.paragraph_revisions
    ADD CONSTRAINT paragraph_revisions_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: reactions reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.reactions
    ADD CONSTRAINT reactions_pkey PRIMARY KEY (id);


--
-- Name: stories stories_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_pkey PRIMARY KEY (chapter_id);


--
-- Name: story_access story_access_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_access
    ADD CONSTRAINT story_access_pkey PRIMARY KEY (story_title_id, user_id);


--
-- Name: story_attributes story_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_attributes
    ADD CONSTRAINT story_attributes_pkey PRIMARY KEY (id);


--
-- Name: story_initiators story_initiators_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_initiators
    ADD CONSTRAINT story_initiators_pkey PRIMARY KEY (creator_id);


--
-- Name: story_title story_title_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_title
    ADD CONSTRAINT story_title_pkey PRIMARY KEY (story_title_id);


--
-- Name: story_title_revisions story_title_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_title_revisions
    ADD CONSTRAINT story_title_revisions_pkey PRIMARY KEY (id);


--
-- Name: subscribers subscribers_email_key; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_email_key UNIQUE (email);


--
-- Name: subscribers subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: contributions_story_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX contributions_story_idx ON public.contributions USING btree (story_title_id, status, created_at DESC);


--
-- Name: contributions_user_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX contributions_user_idx ON public.contributions USING btree (author_user_id, status, created_at DESC);


--
-- Name: crdt_changes_doc_ts_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX crdt_changes_doc_ts_idx ON public.crdt_changes USING btree (doc_id, ts);


--
-- Name: crdt_documents_branch_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX crdt_documents_branch_idx ON public.crdt_documents USING btree (branch_id);


--
-- Name: crdt_documents_chapter_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX crdt_documents_chapter_idx ON public.crdt_documents USING btree (chapter_id);


--
-- Name: crdt_documents_story_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX crdt_documents_story_idx ON public.crdt_documents USING btree (story_title_id);


--
-- Name: crdt_proposals_status_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX crdt_proposals_status_idx ON public.crdt_proposals USING btree (story_title_id, status);


--
-- Name: crdt_proposals_story_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX crdt_proposals_story_idx ON public.crdt_proposals USING btree (story_title_id);


--
-- Name: creative_spaces_user_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX creative_spaces_user_idx ON public.creative_spaces USING btree (user_id);


--
-- Name: idx_stories_story_title_id; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX idx_stories_story_title_id ON public.stories USING btree (story_title_id);


--
-- Name: authors authors_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.local_users(id) ON DELETE CASCADE;


--
-- Name: authors authors_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.local_users(id) ON DELETE CASCADE;


--
-- Name: chapter_comments chapter_comments_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.chapter_comments
    ADD CONSTRAINT chapter_comments_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.stories(chapter_id) ON DELETE CASCADE;


--
-- Name: chapter_contributors chapter_contributors_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.chapter_contributors
    ADD CONSTRAINT chapter_contributors_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.stories(chapter_id) ON DELETE CASCADE;


--
-- Name: chapter_likes chapter_likes_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.chapter_likes
    ADD CONSTRAINT chapter_likes_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.stories(chapter_id) ON DELETE CASCADE;


--
-- Name: chapter_revisions chapter_revisions_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.chapter_revisions
    ADD CONSTRAINT chapter_revisions_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.stories(chapter_id) ON DELETE CASCADE;


--
-- Name: comments comments_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.stories(chapter_id) ON DELETE CASCADE;


--
-- Name: comments comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comments comments_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.local_users(id) ON DELETE CASCADE;


--
-- Name: contributions contributions_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.local_users(id) ON DELETE SET NULL;


--
-- Name: contributions contributions_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.stories(chapter_id) ON DELETE CASCADE;


--
-- Name: contributions contributions_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


--
-- Name: crdt_changes crdt_changes_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_changes
    ADD CONSTRAINT crdt_changes_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.local_users(id) ON DELETE SET NULL;


--
-- Name: crdt_changes crdt_changes_doc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_changes
    ADD CONSTRAINT crdt_changes_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES public.crdt_documents(id) ON DELETE CASCADE;


--
-- Name: crdt_documents crdt_documents_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_documents
    ADD CONSTRAINT crdt_documents_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.stories(chapter_id) ON DELETE CASCADE;


--
-- Name: crdt_documents crdt_documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_documents
    ADD CONSTRAINT crdt_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.local_users(id) ON DELETE SET NULL;


--
-- Name: crdt_documents crdt_documents_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_documents
    ADD CONSTRAINT crdt_documents_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.local_users(id) ON DELETE SET NULL;


--
-- Name: crdt_documents crdt_documents_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_documents
    ADD CONSTRAINT crdt_documents_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


--
-- Name: crdt_proposals crdt_proposals_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_proposals
    ADD CONSTRAINT crdt_proposals_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.local_users(id) ON DELETE CASCADE;


--
-- Name: crdt_proposals crdt_proposals_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_proposals
    ADD CONSTRAINT crdt_proposals_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.local_users(id) ON DELETE SET NULL;


--
-- Name: crdt_proposals crdt_proposals_doc_fk; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_proposals
    ADD CONSTRAINT crdt_proposals_doc_fk FOREIGN KEY (doc_id) REFERENCES public.crdt_documents(id) ON DELETE CASCADE;


--
-- Name: crdt_proposals crdt_proposals_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_proposals
    ADD CONSTRAINT crdt_proposals_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


--
-- Name: crdt_proposals crdt_proposals_target_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_proposals
    ADD CONSTRAINT crdt_proposals_target_chapter_id_fkey FOREIGN KEY (target_chapter_id) REFERENCES public.stories(chapter_id) ON DELETE CASCADE;


--
-- Name: paragraph_branches paragraph_branches_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.paragraph_branches
    ADD CONSTRAINT paragraph_branches_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.stories(chapter_id) ON DELETE CASCADE;


--
-- Name: paragraph_revisions paragraph_revisions_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.paragraph_revisions
    ADD CONSTRAINT paragraph_revisions_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.stories(chapter_id) ON DELETE CASCADE;


--
-- Name: reactions reactions_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.reactions
    ADD CONSTRAINT reactions_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.stories(chapter_id) ON DELETE CASCADE;


--
-- Name: reactions reactions_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.reactions
    ADD CONSTRAINT reactions_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


--
-- Name: reactions reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.reactions
    ADD CONSTRAINT reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.local_users(id) ON DELETE CASCADE;


--
-- Name: stories stories_contributor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_contributor_id_fkey FOREIGN KEY (contributor_id) REFERENCES public.profiles(id);


--
-- Name: stories stories_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


--
-- Name: story_access story_access_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_access
    ADD CONSTRAINT story_access_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


--
-- Name: story_access story_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_access
    ADD CONSTRAINT story_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.local_users(id) ON DELETE CASCADE;


--
-- Name: story_initiators story_initiators_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_initiators
    ADD CONSTRAINT story_initiators_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.local_users(id) ON DELETE CASCADE;


--
-- Name: story_initiators story_initiators_initiator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_initiators
    ADD CONSTRAINT story_initiators_initiator_id_fkey FOREIGN KEY (initiator_id) REFERENCES public.local_users(id) ON DELETE CASCADE;


--
-- Name: story_title_revisions story_title_revisions_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_title_revisions
    ADD CONSTRAINT story_title_revisions_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 85zfy7HkZxYsoZgwaXbVzWFxBxcD1HI8xJc5xQSjUm659gToc4qfMDLKDTXy3kW

