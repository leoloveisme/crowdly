--
-- PostgreSQL database dump
--

\restrict kTkdeLm5e0EFNLeh2UuVtNARKl2xwOSgHnSs2NcdbOlybire0YHROLN2Hq4MFaP

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
-- Name: alpha_applications; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.alpha_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    motivation_letter text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by uuid
);


ALTER TABLE public.alpha_applications OWNER TO lad;

--
-- Name: alpha_invitations; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.alpha_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invitation_code text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    invited_by uuid,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    joined_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.alpha_invitations OWNER TO lad;

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
    parent_comment_id uuid,
    screenplay_id uuid,
    screenplay_scene_id uuid
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
-- Name: creative_space_items; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.creative_space_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    space_id uuid NOT NULL,
    relative_path text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    mime_type text,
    size_bytes bigint,
    hash text,
    visibility text,
    published boolean,
    deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text
);


ALTER TABLE public.creative_space_items OWNER TO lad;

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
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    visibility text DEFAULT 'private'::text NOT NULL,
    published boolean DEFAULT false NOT NULL,
    default_item_visibility text,
    last_synced_at timestamp with time zone,
    sync_state text
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
-- Name: locales; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.locales (
    code text NOT NULL,
    english_name text NOT NULL,
    native_name text,
    direction text DEFAULT 'ltr'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.locales OWNER TO lad;

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
    real_nickname text,
    show_public_stories boolean DEFAULT true,
    show_public_screenplays boolean DEFAULT true,
    show_public_favorites boolean DEFAULT true,
    show_public_living boolean DEFAULT true,
    show_public_lived boolean DEFAULT true,
    favorites_visibility text DEFAULT 'public'::text,
    living_visibility text DEFAULT 'public'::text,
    lived_visibility text DEFAULT 'public'::text,
    favorites_selected_user_ids uuid[] DEFAULT '{}'::uuid[],
    living_selected_user_ids uuid[] DEFAULT '{}'::uuid[],
    lived_selected_user_ids uuid[] DEFAULT '{}'::uuid[],
    stories_visibility text DEFAULT 'public'::text,
    screenplays_visibility text DEFAULT 'public'::text,
    stories_selected_user_ids uuid[] DEFAULT '{}'::uuid[],
    screenplays_selected_user_ids uuid[] DEFAULT '{}'::uuid[],
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    screenplay_id uuid,
    screenplay_scene_id uuid
);


ALTER TABLE public.reactions OWNER TO lad;

--
-- Name: screenplay_access; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.screenplay_access (
    screenplay_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'owner'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.screenplay_access OWNER TO lad;

--
-- Name: screenplay_block; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.screenplay_block (
    block_id uuid DEFAULT gen_random_uuid() NOT NULL,
    screenplay_id uuid NOT NULL,
    scene_id uuid,
    block_index integer NOT NULL,
    block_type text NOT NULL,
    text text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.screenplay_block OWNER TO lad;

--
-- Name: screenplay_scene; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.screenplay_scene (
    scene_id uuid DEFAULT gen_random_uuid() NOT NULL,
    screenplay_id uuid NOT NULL,
    scene_index integer NOT NULL,
    slugline text NOT NULL,
    location text,
    time_of_day text,
    is_interior boolean,
    synopsis text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.screenplay_scene OWNER TO lad;

--
-- Name: screenplay_title; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.screenplay_title (
    screenplay_id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    creator_id uuid,
    visibility text DEFAULT 'public'::text NOT NULL,
    published boolean DEFAULT true NOT NULL,
    genre text,
    tags text[],
    format_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    creative_space_id uuid
);


ALTER TABLE public.screenplay_title OWNER TO lad;

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
-- Name: story_attachments; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.story_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_title_id uuid NOT NULL,
    space_id uuid NOT NULL,
    item_id uuid NOT NULL,
    kind text DEFAULT 'other'::text NOT NULL,
    role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.story_attachments OWNER TO lad;

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
-- Name: story_screenplay_links; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.story_screenplay_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_title_id uuid NOT NULL,
    screenplay_id uuid NOT NULL,
    relation_type text DEFAULT 'adaptation'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.story_screenplay_links OWNER TO lad;

--
-- Name: story_spaces; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.story_spaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_title_id uuid NOT NULL,
    space_id uuid NOT NULL,
    role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.story_spaces OWNER TO lad;

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
    tags text[],
    creative_space_id uuid
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
-- Name: user_story_status; Type: TABLE; Schema: public; Owner: lad
--

CREATE TABLE public.user_story_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content_type text NOT NULL,
    story_title_id uuid,
    screenplay_id uuid,
    is_favorite boolean DEFAULT false NOT NULL,
    is_living boolean DEFAULT false NOT NULL,
    is_lived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_story_status_type_check CHECK ((content_type = ANY (ARRAY['story'::text, 'screenplay'::text])))
);


ALTER TABLE public.user_story_status OWNER TO lad;

--
-- Name: crdt_changes id; Type: DEFAULT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.crdt_changes ALTER COLUMN id SET DEFAULT nextval('public.crdt_changes_id_seq'::regclass);


--
-- Data for Name: alpha_applications; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.alpha_applications (id, first_name, last_name, email, motivation_letter, status, created_at, processed_at, processed_by) FROM stdin;
\.


--
-- Data for Name: alpha_invitations; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.alpha_invitations (id, invitation_code, first_name, last_name, email, invited_by, invited_at, joined_at, status, created_at) FROM stdin;
b9214906-1d3d-4591-a0db-5bcc30de628f	inv-da4227f5-084e-4543-a26e-ac93159d1925	Leo	Force	4leo@leoloveis.me	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2026-02-11 21:13:09.575952+01	2026-02-11 21:17:26.392644+01	joined	2026-02-11 21:13:09.575952+01
\.


--
-- Data for Name: authors; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.authors (creator_id, author_id, created_at, updated_at) FROM stdin;
6f542cd0-551b-4ec9-b2b0-61113dd7af2b	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-23 12:12:53.237302+01	2025-12-23 12:12:53.237302+01
cad23ca1-121d-448f-8947-ddd5048ecb15	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:11:44.427964+01	2026-01-12 11:44:01.95984+01
aef37573-600e-4442-9ae1-63a05799d9a0	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:32:07.197304+01	2026-01-15 22:03:37.648236+01
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
14fff4c8-d571-4b7b-b717-bbb9c7c5fc7a	bde622be-157c-49ff-a131-96d02a7e0284	Chapter	Chapter	{""}	{}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:11:44.427964+01	Desktop sync	en	1
c433bab1-4c19-437b-9018-2d0a9f106330	bde622be-157c-49ff-a131-96d02a7e0284	Chapter	Intro	{}	{"It is a series of short stories."}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:15:52.628119+01	Desktop sync	en	2
e47c0c93-fcc2-4680-ba14-04e00538b986	c35dbd92-0686-4036-9b5c-74db0e8cf177	\N	Chapter 1 - What goes around, comes around	\N	{"Adding couple of words here"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:15:52.628119+01	Desktop sync (created)	en	1
1b31a6ef-348f-4e43-a4f6-86ea60d5f50a	1988ba43-a32f-4f5b-8698-9fcbc1b10ad7	\N	Chapter 2 - Bla Bla Blu - is not my song	\N	{"There is a popular female Thai  singer who sings this song"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:16:54.42495+01	Desktop sync (created)	en	1
a7d56bd7-73b6-4860-a043-a5190b24ad71	f4985aa1-0b7d-4c64-9234-99288c0846b5	Chapter	Chapter	{""}	{"#New story by Leo Love"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:23:11.836369+01	Desktop sync	en	1
e37241df-55b7-4fd7-87c6-d1f2a4f1e50a	0e4ec8f8-acb9-4c5e-be77-cda6021976fa	\N	Intro	\N	{"some intro text"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:23:11.836369+01	Desktop sync (created)	en	1
9fd5be7c-fc03-44c1-8132-0929ba5aab97	988e930d-258c-40e1-aa52-7fa141eb1fb5	\N	Chapter 1	\N	{"Text of chapter 1"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:23:11.836369+01	Desktop sync (created)	en	1
dd0c715c-83a1-44d2-b353-4ed85ea7b08f	e94a297c-d4e3-417f-b04b-2146b521a668	\N	Chapter 2	\N	{"Text of chapter 2"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:23:11.836369+01	Desktop sync (created)	en	1
190394da-f63f-497d-aa2a-62f5a3cc5a4a	f4985aa1-0b7d-4c64-9234-99288c0846b5	Chapter	Intro	{"#New story by Leo Love"}	{"some intro text"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:40:50.235847+01	Desktop sync	en	2
638f80d4-f825-4fb2-b313-af183fee3e20	0e4ec8f8-acb9-4c5e-be77-cda6021976fa	Intro	Chapter 1	{"some intro text"}	{"Text of chapter 1"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:40:50.235847+01	Desktop sync	en	2
319d034e-0a5c-4f85-890e-aea1ddbc04f9	988e930d-258c-40e1-aa52-7fa141eb1fb5	Chapter 1	Chapter 2	{"Text of chapter 1"}	{"Text of chapter 2"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:40:50.235847+01	Desktop sync	en	2
a08c9bf9-c372-4a4a-948b-0aa669b58a72	e94a297c-d4e3-417f-b04b-2146b521a668	Chapter 2	Chapter 3	{"Text of chapter 2"}	{"text for chapter 3"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:40:50.235847+01	Desktop sync	en	2
7fc4ed2e-04c4-48ad-8885-3ede583bd732	f23e7e91-9f17-4814-b422-f83188ed8897	Chapter	Intro	{""}	{"some intro text"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:43:02.589403+01	Desktop sync	en	1
2e586596-5726-42d7-a7e5-d3423bffe184	8fb7c09e-5e82-471e-ad6d-c566494dcfbf	\N	Chapter 1	\N	{"Text of chapter 1"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:43:02.589403+01	Desktop sync (created)	en	1
ce1c574f-3b28-48cb-8a86-4dc96ebbb415	e975c6d7-f327-431c-a256-f01e3d77afe3	\N	Chapter 2	\N	{"Text of chapter 2"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:43:02.589403+01	Desktop sync (created)	en	1
ee8676e0-301e-4356-a6bd-4e2b90573f10	0ff85c0d-b0de-4705-96e3-b569b67b0d6a	\N	Chapter 3	\N	{"text for chapter 3"}	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:43:02.589403+01	Desktop sync (created)	en	1
5920cbc7-fda8-478a-831f-9a50055e789d	20c98a0f-5396-47af-982c-c418de96934b	The day I was conceived	The day I was conceived	{test}	{"Was a dark and cold one. It was rainy and windy outside."}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:47:21.993556+01	Desktop sync	en	1
e8a6a2e2-4850-4a6c-bcdb-76e0befe7d6e	520ff5b7-fc08-4c04-bdbb-8de2ad202972	And life goes on	And life goes on	{"as always"}	{"as always, as it should, it would be rather unusual if it wouldn't, however such a story is also not entirely impossible. :)"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:47:21.993556+01	Desktop sync	en	3
57eafae2-62db-4f56-851f-67df8c62cd6b	20c98a0f-5396-47af-982c-c418de96934b	The day I was conceived	The day I was conceived	{"Was a dark and cold one. It was rainy and windy outside."}	{"Was a dark and cold one. It was rainy and windy outside - this however is not a problem for two people who are passionately in love."}	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:48:06.022141+01	Desktop sync	en	2
51be936d-c02b-4be9-81ee-a7bcf0b9cfd7	5e88d7d5-6610-4e29-99b8-b2eadeab0141	Chapter	Initiating thought	{""}	{"some paragraph text here"}	cad23ca1-121d-448f-8947-ddd5048ecb15	2026-01-12 11:44:01.95984+01	Desktop sync	en	1
e4d6999d-ea8a-4cd0-a8dd-ec49e996c10a	38520fb9-77ae-449e-b9cd-5d91c0aef2fd	Chapter 1 - Journey into wilderness	Chapter 1 - Journey into wilderness	{"Some text with some text","Another paragraph with some more text","Some paragraph text","Some text with some text","Another paragraph with some more text","Some paragraph text"}	{"Some text with some text","Another paragraph with some more text"}	aef37573-600e-4442-9ae1-63a05799d9a0	2026-01-15 22:03:37.648236+01	Desktop sync	en	1
\.


--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.comments (id, user_id, story_title_id, chapter_id, paragraph_index, body, created_at, parent_comment_id, screenplay_id, screenplay_scene_id) FROM stdin;
0f94d494-bf73-4244-9d8d-1e7109f89401	aef37573-600e-4442-9ae1-63a05799d9a0	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	\N	:)	2026-01-09 15:30:36.745468+01	\N	\N	\N
fce0b433-af45-4934-96a3-41e9af28dbf0	aef37573-600e-4442-9ae1-63a05799d9a0	\N	\N	\N	:)	2026-01-09 15:42:37.411051+01	\N	055b3e41-4f7d-490f-9b29-128b908c3552	\N
888684a6-5f12-44be-b327-432e6544900f	aef37573-600e-4442-9ae1-63a05799d9a0	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	20c98a0f-5396-47af-982c-c418de96934b	\N	:)	2026-01-09 15:57:13.675306+01	\N	\N	\N
9e7916a3-9a74-41c0-814d-bd55a35005ba	aef37573-600e-4442-9ae1-63a05799d9a0	\N	\N	\N	:)	2026-01-09 16:35:51.058117+01	\N	055b3e41-4f7d-490f-9b29-128b908c3552	\N
e0d86267-88e1-4fb9-b6e0-e33a4f7715b7	aef37573-600e-4442-9ae1-63a05799d9a0	\N	\N	\N	:)	2026-01-09 16:36:41.319566+01	\N	055b3e41-4f7d-490f-9b29-128b908c3552	a879ffa0-9984-4667-b7d4-87a665fc5b6f
2bb15453-8843-4e9d-9bb3-78bc972f6431	aef37573-600e-4442-9ae1-63a05799d9a0	\N	\N	\N	:)	2026-01-09 16:37:01.746129+01	\N	055b3e41-4f7d-490f-9b29-128b908c3552	\N
ecb7dfa4-6938-4c5d-ab80-fc29d288c98a	aef37573-600e-4442-9ae1-63a05799d9a0	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	20c98a0f-5396-47af-982c-c418de96934b	\N	Hi	2026-01-09 16:52:27.975826+01	\N	\N	\N
ac1f0b4d-7753-4926-ab27-cceb360adbf9	aef37573-600e-4442-9ae1-63a05799d9a0	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	\N	Hello	2026-01-09 16:52:36.924544+01	\N	\N	\N
4b5f59e4-d246-49ac-a427-230ea8cebff1	aef37573-600e-4442-9ae1-63a05799d9a0	\N	\N	\N	Greetings	2026-01-09 16:53:22.104338+01	\N	055b3e41-4f7d-490f-9b29-128b908c3552	\N
0562bbff-aa60-4f8f-9f3e-ba7455b96e3e	aef37573-600e-4442-9ae1-63a05799d9a0	\N	\N	\N	;)	2026-01-09 16:53:43.842327+01	\N	055b3e41-4f7d-490f-9b29-128b908c3552	8cb61e87-bf36-4319-9a98-482e2d18902a
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
1b31a6ef-348f-4e43-a4f6-86ea60d5f50a	1e6bb2d6-0430-439d-99cf-4616617dfbf8	1988ba43-a32f-4f5b-8698-9fcbc1b10ad7	\N	0	paragraph	legacy-backfill	1b31a6ef-348f-4e43-a4f6-86ea60d5f50a	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	11	There is a popular female Thai  singer who sings this song	2025-12-29 15:16:54.424+01
c433bab1-4c19-437b-9018-2d0a9f106330	1e6bb2d6-0430-439d-99cf-4616617dfbf8	bde622be-157c-49ff-a131-96d02a7e0284	\N	0	paragraph	legacy-backfill	c433bab1-4c19-437b-9018-2d0a9f106330	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	7	It is a series of short stories.	2025-12-29 15:15:52.628+01
e47c0c93-fcc2-4680-ba14-04e00538b986	1e6bb2d6-0430-439d-99cf-4616617dfbf8	c35dbd92-0686-4036-9b5c-74db0e8cf177	\N	0	paragraph	legacy-backfill	e47c0c93-fcc2-4680-ba14-04e00538b986	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	5	Adding couple of words here	2025-12-29 15:15:52.628+01
a7d56bd7-73b6-4860-a043-a5190b24ad71	10e2ca77-0b5c-4f72-aeee-965cbe4db67a	f4985aa1-0b7d-4c64-9234-99288c0846b5	\N	0	paragraph	legacy-backfill	a7d56bd7-73b6-4860-a043-a5190b24ad71	aef37573-600e-4442-9ae1-63a05799d9a0	approved	5	#New story by Leo Love	2025-12-29 15:23:11.836+01
e37241df-55b7-4fd7-87c6-d1f2a4f1e50a	10e2ca77-0b5c-4f72-aeee-965cbe4db67a	0e4ec8f8-acb9-4c5e-be77-cda6021976fa	\N	0	paragraph	legacy-backfill	e37241df-55b7-4fd7-87c6-d1f2a4f1e50a	aef37573-600e-4442-9ae1-63a05799d9a0	approved	3	some intro text	2025-12-29 15:23:11.836+01
9fd5be7c-fc03-44c1-8132-0929ba5aab97	10e2ca77-0b5c-4f72-aeee-965cbe4db67a	988e930d-258c-40e1-aa52-7fa141eb1fb5	\N	0	paragraph	legacy-backfill	9fd5be7c-fc03-44c1-8132-0929ba5aab97	aef37573-600e-4442-9ae1-63a05799d9a0	approved	4	Text of chapter 1	2025-12-29 15:23:11.836+01
dd0c715c-83a1-44d2-b353-4ed85ea7b08f	10e2ca77-0b5c-4f72-aeee-965cbe4db67a	e94a297c-d4e3-417f-b04b-2146b521a668	\N	0	paragraph	legacy-backfill	dd0c715c-83a1-44d2-b353-4ed85ea7b08f	aef37573-600e-4442-9ae1-63a05799d9a0	approved	4	Text of chapter 2	2025-12-29 15:23:11.836+01
7fc4ed2e-04c4-48ad-8885-3ede583bd732	6174fd71-525f-40c7-a6e1-3c40f3ea57d5	f23e7e91-9f17-4814-b422-f83188ed8897	\N	0	paragraph	legacy-backfill	7fc4ed2e-04c4-48ad-8885-3ede583bd732	aef37573-600e-4442-9ae1-63a05799d9a0	approved	3	some intro text	2025-12-29 15:43:02.589+01
2e586596-5726-42d7-a7e5-d3423bffe184	6174fd71-525f-40c7-a6e1-3c40f3ea57d5	8fb7c09e-5e82-471e-ad6d-c566494dcfbf	\N	0	paragraph	legacy-backfill	2e586596-5726-42d7-a7e5-d3423bffe184	aef37573-600e-4442-9ae1-63a05799d9a0	approved	4	Text of chapter 1	2025-12-29 15:43:02.589+01
ce1c574f-3b28-48cb-8a86-4dc96ebbb415	6174fd71-525f-40c7-a6e1-3c40f3ea57d5	e975c6d7-f327-431c-a256-f01e3d77afe3	\N	0	paragraph	legacy-backfill	ce1c574f-3b28-48cb-8a86-4dc96ebbb415	aef37573-600e-4442-9ae1-63a05799d9a0	approved	4	Text of chapter 2	2025-12-29 15:43:02.589+01
ee8676e0-301e-4356-a6bd-4e2b90573f10	6174fd71-525f-40c7-a6e1-3c40f3ea57d5	0ff85c0d-b0de-4705-96e3-b569b67b0d6a	\N	0	paragraph	legacy-backfill	ee8676e0-301e-4356-a6bd-4e2b90573f10	aef37573-600e-4442-9ae1-63a05799d9a0	approved	4	text for chapter 3	2025-12-29 15:43:02.589+01
51be936d-c02b-4be9-81ee-a7bcf0b9cfd7	96cb717c-7856-4879-b4a2-30843238c7f5	5e88d7d5-6610-4e29-99b8-b2eadeab0141	\N	0	paragraph	legacy-backfill	51be936d-c02b-4be9-81ee-a7bcf0b9cfd7	cad23ca1-121d-448f-8947-ddd5048ecb15	approved	4	some paragraph text here	2026-01-12 11:44:01.959+01
1fb4f877-fd5c-4bef-8dd3-049477fa1fd5	751c6c7b-d272-4853-b982-db29b911facc	914efa1d-c60d-4e02-8b3c-5d13b2cf4de4	\N	0	paragraph	legacy-backfill	1fb4f877-fd5c-4bef-8dd3-049477fa1fd5	aef37573-600e-4442-9ae1-63a05799d9a0	approved	21	It was a nice clear day. No clouds on the sky were to be seen. It was such a nice day.	2025-12-14 15:43:29.874+01
e4d6999d-ea8a-4cd0-a8dd-ec49e996c10a	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	38520fb9-77ae-449e-b9cd-5d91c0aef2fd	\N	0	paragraph	legacy-backfill	e4d6999d-ea8a-4cd0-a8dd-ec49e996c10a	aef37573-600e-4442-9ae1-63a05799d9a0	approved	5	Some text with some text	2026-01-15 22:03:37.648+01
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
-- Data for Name: creative_space_items; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.creative_space_items (id, space_id, relative_path, name, kind, mime_type, size_bytes, hash, visibility, published, deleted, created_at, updated_at, updated_by) FROM stdin;
77a13ed0-8336-4a78-ae7d-53aa3ed2692f	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live	Veronika decides to live	folder	\N	\N	\N	private	f	f	2026-01-12 17:10:45.432707+01	2026-01-12 17:10:45.432707+01	aef37573-600e-4442-9ae1-63a05799d9a0
3b0b3006-8fef-421c-96e5-980f19053e93	46577979-a698-4498-a62a-3de3bc327635	about.md	about.md	file	\N	212	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c271b866-9f08-47c0-8e77-a4556c938652	46577979-a698-4498-a62a-3de3bc327635	.gitignore	.gitignore	file	\N	22	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
dc14f43a-97a7-4393-b559-07642b801837	46577979-a698-4498-a62a-3de3bc327635	timeline.md	timeline.md	file	\N	1577	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
de2edfa8-46ec-4cea-b1a4-6486f0f085bc	46577979-a698-4498-a62a-3de3bc327635	characters.md	characters.md	file	\N	4034	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
57f6614a-4f2a-47c4-a8cb-e17e9bb5d181	46577979-a698-4498-a62a-3de3bc327635	veronika_story_outline.md	veronika_story_outline.md	file	\N	14955	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b685106f-cec6-4e9b-b69b-d06f5369c17b	46577979-a698-4498-a62a-3de3bc327635	Veronika Decides to Live - Complete Story Outline.pdf	Veronika Decides to Live - Complete Story Outline.pdf	file	\N	214305	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
60e1d22d-510d-404c-accd-c08d19ab24c2	46577979-a698-4498-a62a-3de3bc327635	veronika_story_outline_v4.md	veronika_story_outline_v4.md	file	\N	15406	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c44235fe-c335-4ab3-a609-cc074e6c1f72	46577979-a698-4498-a62a-3de3bc327635	Veronika Decides to Live - Complete Story Outline v4.pdf	Veronika Decides to Live - Complete Story Outline v4.pdf	file	\N	219451	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a62400a9-14b5-4bd1-bb06-4bb16c093ac1	46577979-a698-4498-a62a-3de3bc327635	veronika_story_outline_v5.md	veronika_story_outline_v5.md	file	\N	15517	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8e6a7e53-b74e-4423-8870-676b121a19a7	46577979-a698-4498-a62a-3de3bc327635	Veronika Decides to Live - Complete Story Outline v5.pdf	Veronika Decides to Live - Complete Story Outline v5.pdf	file	\N	219460	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2ead6f5f-de95-41b0-a878-d4fe0d9fb64b	46577979-a698-4498-a62a-3de3bc327635	Veronika Decides to Live - Complete Story Outline v7.pdf	Veronika Decides to Live - Complete Story Outline v7.pdf	file	\N	220252	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0bdc4f31-ab79-49f4-9d2f-512f65fb1f6d	46577979-a698-4498-a62a-3de3bc327635	veronika_story_outline v7.md	veronika_story_outline v7.md	file	\N	15713	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
97ea1280-9d24-4669-8962-85d61fb50ac3	46577979-a698-4498-a62a-3de3bc327635	Veronika Decides to Live - Complete Story Outline v10.pdf	Veronika Decides to Live - Complete Story Outline v10.pdf	file	\N	232383	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8940f138-f9dd-4e2d-86a6-afe3a1d4fc96	46577979-a698-4498-a62a-3de3bc327635	veronika_story_outline v10.md	veronika_story_outline v10.md	file	\N	17349	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ca2035ca-8d70-4f2c-a331-1ba053844558	46577979-a698-4498-a62a-3de3bc327635	home_lad_Dropbox_content_creation_Veronika_Veronika_decides_to_live_Screenplay_s.pdf	home_lad_Dropbox_content_creation_Veronika_Veronika_decides_to_live_Screenplay_s.pdf	file	\N	58280	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0557ed4e-c407-4e6c-9302-fd082a4a11b9	46577979-a698-4498-a62a-3de3bc327635	Merged Notebook-1.pdf	Merged Notebook-1.pdf	file	\N	501185	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2c7ac955-197e-431c-89b7-616fcd1332d9	46577979-a698-4498-a62a-3de3bc327635	Veronika Decides to Live - Complete Story Outline V15.pdf	Veronika Decides to Live - Complete Story Outline V15.pdf	file	\N	242985	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
47d19b20-db6b-4592-b51c-438f3c0933ec	46577979-a698-4498-a62a-3de3bc327635	Veronika_decides_to_live.pdf	Veronika_decides_to_live.pdf	file	\N	204035	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
982b6b4d-5625-49d9-ac39-afb788712b65	46577979-a698-4498-a62a-3de3bc327635	veronika decides to live_.pdf	veronika decides to live_.pdf	file	\N	260063	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9158ec02-524d-4d28-ad68-3b07e3ef0cf2	46577979-a698-4498-a62a-3de3bc327635	veronika chapters outline for screenplay.md	veronika chapters outline for screenplay.md	file	\N	15835	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
bc331e2f-4f64-4bdf-9fe1-cdd880f2edb7	46577979-a698-4498-a62a-3de3bc327635	chapters timeline - Copy.md	chapters timeline - Copy.md	file	\N	1377	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
75dda02d-739c-4e9a-a428-9f2b7ee400be	46577979-a698-4498-a62a-3de3bc327635	brainstorming.md	brainstorming.md	file	\N	25127	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
26aca5c5-fa5a-409c-bac1-fe2ba82b98ac	46577979-a698-4498-a62a-3de3bc327635	story timeline.md	story timeline.md	file	\N	690	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8b95e507-83cc-4ffa-8aa3-c4488f6eea81	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live.md	Veronika decides to live.md	file	\N	73075	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c520f89b-dd4e-45bf-892a-d998607b2e66	46577979-a698-4498-a62a-3de3bc327635	.git/refs/heads/main	main	file	\N	41	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4911d6f4-be90-466a-a813-2b7e3bfb4cee	46577979-a698-4498-a62a-3de3bc327635	.git/refs/remotes/origin/main	main	file	\N	41	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
26a2b3c7-77d1-4439-9650-345bc7f51faa	46577979-a698-4498-a62a-3de3bc327635	.git/objects/pack/pack-07845aa90d84e5d51a49504a1345a063617569e8.pack	pack-07845aa90d84e5d51a49504a1345a063617569e8.pack	file	\N	6087	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f09b1d80-51ee-43da-9df4-952bd343bd74	46577979-a698-4498-a62a-3de3bc327635	.git/objects/pack/pack-07845aa90d84e5d51a49504a1345a063617569e8.rev	pack-07845aa90d84e5d51a49504a1345a063617569e8.rev	file	\N	124	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4558526e-a41f-41d5-a62a-7cedf101aa5f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/pack/pack-07845aa90d84e5d51a49504a1345a063617569e8.idx	pack-07845aa90d84e5d51a49504a1345a063617569e8.idx	file	\N	1576	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7f72e4e1-85a4-49dc-bc8e-450db9af264c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/a8/ba1267bb9e8d3fd289b27de6a7b6394659c80b	ba1267bb9e8d3fd289b27de6a7b6394659c80b	file	\N	135	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a8f39bd0-a332-44e4-a208-b865e7e180d5	46577979-a698-4498-a62a-3de3bc327635	.git/objects/aa/fa579a6215edcc160b03e69357b9208dad1691	fa579a6215edcc160b03e69357b9208dad1691	file	\N	7800	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3a2a96be-119f-457d-8197-00235d8ba2f4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/aa/25ec7c79c7ee0e30cc9d0244d6bb49c87e14f8	25ec7c79c7ee0e30cc9d0244d6bb49c87e14f8	file	\N	167	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
825e4f2c-2541-4910-b17b-8e8fa9a9f60a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/3b/d0e4a4361fc5bf2f999c7cd07bfa2645c71cb2	d0e4a4361fc5bf2f999c7cd07bfa2645c71cb2	file	\N	9809	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2778b06d-6153-4ec9-81fd-da929ebb1adc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/3b/099dfcd51479a59c2df409a41482981ec152a9	099dfcd51479a59c2df409a41482981ec152a9	file	\N	393	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
89f45968-b717-45ea-bb58-dc2d69d978b6	46577979-a698-4498-a62a-3de3bc327635	.git/objects/3b/7e17f1c69e366abd9bc31bc466ea63140e3b28	7e17f1c69e366abd9bc31bc466ea63140e3b28	file	\N	312	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7225569e-0002-42ab-ab68-b3c2acea7d72	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5e/ebf1c8446d85ab20250d69893da6e84db036d7	ebf1c8446d85ab20250d69893da6e84db036d7	file	\N	10346	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b9fbdcdd-3e72-474c-8ad4-d4ba9a8e0bb9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5e/e5384e1de0fabad92ed728dc278bbd4bb8898c	e5384e1de0fabad92ed728dc278bbd4bb8898c	file	\N	649	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4e008f2a-33a1-4369-afde-aaa21bc3b70c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/8a	8a	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4c790147-fcf4-442f-80f9-70fbe64c5eb5	46577979-a698-4498-a62a-3de3bc327635	.git/objects/8a/d1051ef14565aa5bdfa92fdb4a7fb912037165	d1051ef14565aa5bdfa92fdb4a7fb912037165	file	\N	54	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
31327298-ed17-4022-b2f6-57928d3b609f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/8a/d52858bdd5aa85b17e248102e6c85554461278	d52858bdd5aa85b17e248102e6c85554461278	file	\N	36273	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2a119806-7e41-45ef-994d-941355690b4f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1b/fd7cbf20c2bf1294e806540eb34bcabcec6605	fd7cbf20c2bf1294e806540eb34bcabcec6605	file	\N	241	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
99f338c7-ad30-48a2-8276-d8f1ca38122b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1b/da760653e918fc4fca9a02b046236b0aa02843	da760653e918fc4fca9a02b046236b0aa02843	file	\N	18	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
321e91b7-1432-4f3c-b100-4f95d7a66f31	46577979-a698-4498-a62a-3de3bc327635	.git/objects/97	97	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6b911b66-9035-443f-ae37-d520ed26e686	46577979-a698-4498-a62a-3de3bc327635	.git/objects/97/ca63f48a59c70564601c458805c0827532100c	ca63f48a59c70564601c458805c0827532100c	file	\N	189	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0919a092-1435-4b97-b569-f9f7c6f07c51	46577979-a698-4498-a62a-3de3bc327635	.git/objects/97/2db3e3e74856717a484078d4d2b3a1937b9d4b	2db3e3e74856717a484078d4d2b3a1937b9d4b	file	\N	131313	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c4d33b0f-493b-40a2-823e-00e6bf30d60f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/97/27e60748f7d165d9c68e041799ee61ff1ffc8f	27e60748f7d165d9c68e041799ee61ff1ffc8f	file	\N	820	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
184ce0b8-6d6c-4d19-bad4-27565249017f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/97/5ab76ce1cfca5ae1367a42f0a03db8d5e59e06	5ab76ce1cfca5ae1367a42f0a03db8d5e59e06	file	\N	44163	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
03b9c291-e433-4539-a005-f4a204f6272a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/50	50	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6065363a-e6f8-4c8a-b860-7b6f203a0125	46577979-a698-4498-a62a-3de3bc327635	.git/objects/50/c32f5a01df99c5e82e3dab045cd0dc5b41b994	c32f5a01df99c5e82e3dab045cd0dc5b41b994	file	\N	169	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
20c0c734-3c2f-480e-837e-900d7b590b58	46577979-a698-4498-a62a-3de3bc327635	.git/objects/50/381da3300538185ee849e6f6f70253fd64f413	381da3300538185ee849e6f6f70253fd64f413	file	\N	909	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1f2223d1-a503-49db-a6f1-4a81f7f13c3c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/50/2520761835e63b9b6777cda35f1e30d0d5a476	2520761835e63b9b6777cda35f1e30d0d5a476	file	\N	159	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
82aa21b2-9658-418d-b198-e65c07811c69	46577979-a698-4498-a62a-3de3bc327635	.git/objects/3d/455c4b372b53cdb7771777483458213b0a5239	455c4b372b53cdb7771777483458213b0a5239	file	\N	241	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
14458a25-7950-47dd-a4db-c0db7cc1a943	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ad	ad	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7e3b6441-8d61-49e0-bf3f-9addaf843218	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ad/e3981764f2d6a80caa35c094c2786737c8c31f	e3981764f2d6a80caa35c094c2786737c8c31f	file	\N	163	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
73378073-18ac-4d04-b64f-9063015a0c20	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ad/a1937d84d67ae1bc11f2bea9eb5a2b60e1e998	a1937d84d67ae1bc11f2bea9eb5a2b60e1e998	file	\N	242	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ad299d9c-637b-496e-b4ba-b3ae9e4cb28f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ad/8a19320a1f11cf43d62e906133e5aa9b57577e	8a19320a1f11cf43d62e906133e5aa9b57577e	file	\N	9758	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ea095225-f128-4fcf-8f35-cd7c27e62bf1	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9a/7ad0169bd151f73327335bdc225de898eb0574	7ad0169bd151f73327335bdc225de898eb0574	file	\N	97	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
bfdf382b-b309-4342-9208-a6634c5c7ad3	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9a/5419ec080f34b4ccdbd2c429e2f59f962a4355	5419ec080f34b4ccdbd2c429e2f59f962a4355	file	\N	1236	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
831045c3-2845-4339-bad4-57f990216f55	46577979-a698-4498-a62a-3de3bc327635	.git/objects/81/0f01f66ce995130d924743d5fa330b137280dd	0f01f66ce995130d924743d5fa330b137280dd	file	\N	162	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
947ad275-dc27-491c-af4a-3ab98b0c90db	46577979-a698-4498-a62a-3de3bc327635	.git/objects/81/8ab0664e263c03df76ac4ee870cd0307a7434d	8ab0664e263c03df76ac4ee870cd0307a7434d	file	\N	162	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1484c33d-c550-409a-a9ac-3f191c3b5bb0	46577979-a698-4498-a62a-3de3bc327635	.git/objects/81/f6e805b78848a4e52cec7c2bf8982f2eda9e96	f6e805b78848a4e52cec7c2bf8982f2eda9e96	file	\N	21230	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
020cdafc-cbe7-4bd9-9cbb-c749ebc02684	46577979-a698-4498-a62a-3de3bc327635	.git/objects/84/210396387909e9e0ebc2dee93885b20276d27c	210396387909e9e0ebc2dee93885b20276d27c	file	\N	883	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a4c7761c-35a1-4be2-99e1-d53685dc1c73	46577979-a698-4498-a62a-3de3bc327635	.git/objects/84/0b93fc35d28192dcb195454b0ea5936ca77503	0b93fc35d28192dcb195454b0ea5936ca77503	file	\N	242	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d5d04ca9-d0b6-438a-ac77-020fbd6cfbc9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/84/b37249f7a344763b83b831f6f4e32abf50e8fd	b37249f7a344763b83b831f6f4e32abf50e8fd	file	\N	7532	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2fa390ef-ae54-40db-b135-2f2bf77a211e	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c0/d38f5831622cc973a9c584c357d11cc17768f1	d38f5831622cc973a9c584c357d11cc17768f1	file	\N	11696	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a4453519-869e-46ab-ac7b-8f219be32ae2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c0/627f32f760b86c7570e54df8ae35c154f497a7	627f32f760b86c7570e54df8ae35c154f497a7	file	\N	10621	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3dd603f9-26bb-48f9-8d6d-3af43a05f273	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c0/db08568603e888cf3daea18c575485f4602081	db08568603e888cf3daea18c575485f4602081	file	\N	95	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6c8e5fb9-e3bf-411c-bd53-34388c763581	46577979-a698-4498-a62a-3de3bc327635	.git/objects/4f/812f92b9d8fb03a314fcdb93216b2b82c7f9a4	812f92b9d8fb03a314fcdb93216b2b82c7f9a4	file	\N	54	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b22c8af1-97f6-4c9d-b766-31b2c09b7089	46577979-a698-4498-a62a-3de3bc327635	.git/objects/4f/44a9712408b9c202fb7198cd6ad556875459bf	44a9712408b9c202fb7198cd6ad556875459bf	file	\N	17469	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3e2a095d-bc1e-48aa-92b7-9621cf871e34	46577979-a698-4498-a62a-3de3bc327635	.git/objects/cb/7b2037fbb0890124ae9e5eb6d0ae84778a6c88	7b2037fbb0890124ae9e5eb6d0ae84778a6c88	file	\N	243	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d8242146-df1d-4ea7-a69a-81d5fac475aa	46577979-a698-4498-a62a-3de3bc327635	.git/objects/cb/0616b078b7769febb31cdaa9068be0063df3ed	0616b078b7769febb31cdaa9068be0063df3ed	file	\N	270	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ebe799d2-1766-45d3-a5bb-038196f2ea0a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/dd	dd	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9ba65a07-5d5f-4ca4-97df-139b53756de9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/dd/772aaf3bdfcafdfccab9ee4f890f01c699387c	772aaf3bdfcafdfccab9ee4f890f01c699387c	file	\N	177	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5717bc88-9693-48d2-96ba-4542dbc93688	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0e	0e	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ac353034-80cf-42d4-a974-c91cffa20a58	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0e/5922ac15433008a5bb34a0804ad9b695f2ce8b	5922ac15433008a5bb34a0804ad9b695f2ce8b	file	\N	882	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ec1566ab-7ed1-48e7-8dfd-6ad20a209729	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0e/23ecbb61fd67a9be8523561489ed05f2ccd5d1	23ecbb61fd67a9be8523561489ed05f2ccd5d1	file	\N	169	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
81d29c62-d411-4a29-b6e5-29d515db117b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0e/7bcc72db0ecd741b647d905471c6978e53b875	7bcc72db0ecd741b647d905471c6978e53b875	file	\N	97	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6a62a595-f007-4d18-b416-89390301a7bd	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0e/51751381a99f04188e4565f848ca0042013587	51751381a99f04188e4565f848ca0042013587	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
72e1683c-e8cc-409f-b3a0-822c20b67d14	46577979-a698-4498-a62a-3de3bc327635	.git/objects/93	93	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f06a8308-a1d1-4866-b4c4-05558d99dad1	46577979-a698-4498-a62a-3de3bc327635	.git/objects/93/0f91e3d933cc158106f09a78a729be33108032	0f91e3d933cc158106f09a78a729be33108032	file	\N	10083	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1aec8489-f865-474f-94f8-3598160be8ca	46577979-a698-4498-a62a-3de3bc327635	.git/objects/93/f654ab52995c4b1ddade0a8c1abd740f6ffac0	f654ab52995c4b1ddade0a8c1abd740f6ffac0	file	\N	1940	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1e580b36-7f22-414a-bcc7-b85a8506cf50	b882b963-bb2e-47a7-b51a-b5ef9ab2af91	Unterordner	Unterordner	folder	\N	\N	\N	private	f	f	2026-01-13 20:24:10.558629+01	2026-01-13 20:24:10.558629+01	cad23ca1-121d-448f-8947-ddd5048ecb15
733ab162-5f46-4e24-a339-91df2444c7cb	46577979-a698-4498-a62a-3de3bc327635	.git/objects/43/bc2800818636fe4c624bb0ba6982a1f13c1534	bc2800818636fe4c624bb0ba6982a1f13c1534	file	\N	81	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b70872ca-2d6f-4630-90fb-82d998d3320c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/43/77e9c80e05bfd5dfc34e5f4e5e125e0f425471	77e9c80e05bfd5dfc34e5f4e5e125e0f425471	file	\N	565	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6fab2b83-2c04-4149-86ae-99a873bab82b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f7/38eaa5116035bb94ddbc8cf07baf1516412fbb	38eaa5116035bb94ddbc8cf07baf1516412fbb	file	\N	242	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
11b244dd-f205-4fcb-8112-3a6192263c53	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f7/580ac047459c874e0cda23bc954209bd61366e	580ac047459c874e0cda23bc954209bd61366e	file	\N	303	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4de847b6-df48-469d-bfa9-5c337342dfbf	b882b963-bb2e-47a7-b51a-b5ef9ab2af91	some file.txt	some file.txt	file	\N	80	\N	private	f	f	2026-01-13 20:24:10.558629+01	2026-01-13 22:19:31.636704+01	cad23ca1-121d-448f-8947-ddd5048ecb15
40198ae4-7218-4396-94a9-76a8688aaa3b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/96/2f3e3773bf45f4edad03342eed05f951bb296c	2f3e3773bf45f4edad03342eed05f951bb296c	file	\N	187	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
883d58a7-69fb-49ba-aa7b-26aefadf38ca	46577979-a698-4498-a62a-3de3bc327635	.git/objects/96/044d3bf50242138e826aafd83e8b8656199810	044d3bf50242138e826aafd83e8b8656199810	file	\N	241	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e581ebe4-69d4-4bb7-8844-d91d3fbb776c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/96/27ece3e0be4dd980c831c923f330f4319f0e12	27ece3e0be4dd980c831c923f330f4319f0e12	file	\N	928346	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
350bf6c1-6e65-4424-93a2-935a19b08a2f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/de/884af9c681f5f5e697f38cab0cd6f8d6183aed	884af9c681f5f5e697f38cab0cd6f8d6183aed	file	\N	908	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a584621b-254a-46bd-851e-584f71b5b8be	46577979-a698-4498-a62a-3de3bc327635	.git/objects/de/bd0e799c57efa6c89c5acd45f1b38add8098ef	bd0e799c57efa6c89c5acd45f1b38add8098ef	file	\N	7261	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cfbe2d1d-f042-4fdf-a1a7-d48c79cae36c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/de/717978fc706ccdf6072fddcd65758bed0ba313	717978fc706ccdf6072fddcd65758bed0ba313	file	\N	80	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
59bbf96f-613d-4ee9-a36d-c8a85d5b5c10	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e2/295814516bf5e65d5c109a054f4ed09e0ac001	295814516bf5e65d5c109a054f4ed09e0ac001	file	\N	242	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
00017f91-1ac5-48a5-bdb2-16e4766f067f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e2/c5551775fab3e0fa63a8c5f07c913fc9434027	c5551775fab3e0fa63a8c5f07c913fc9434027	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d995288e-b445-4acf-8030-81ccf1e107ce	46577979-a698-4498-a62a-3de3bc327635	.git/objects/a9	a9	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
70e3f3ac-8d93-4190-b568-930f548b280f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/a9/2b1535b2a097350a71aa2c6fe8750eeaa619b6	2b1535b2a097350a71aa2c6fe8750eeaa619b6	file	\N	169	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1a80df44-2985-4ec5-8489-2ef21be60cb3	46577979-a698-4498-a62a-3de3bc327635	.git/objects/a9/8fec17a3cea165c690a190f3b7bccba48cdd58	8fec17a3cea165c690a190f3b7bccba48cdd58	file	\N	174	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4e5b249e-0729-455b-9584-05d69346e676	46577979-a698-4498-a62a-3de3bc327635	.git/objects/16	16	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f9ed5050-3590-4437-ab86-b8c4eb0ae8d9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/a9/9ac3751ce48c2e0c1094220fc815819a72a897	9ac3751ce48c2e0c1094220fc815819a72a897	file	\N	1391	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b1f881f6-66db-4dd9-a7f6-68b9e05eea90	46577979-a698-4498-a62a-3de3bc327635	.git/objects/a9/c19cafab377cfd01091732fb45a25ff979e8c2	c19cafab377cfd01091732fb45a25ff979e8c2	file	\N	174	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e9431d4c-738c-49ab-9894-6dc0db37a8a7	46577979-a698-4498-a62a-3de3bc327635	.git/objects/10	10	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
374a26c8-552d-4008-9597-6c2c055d35c2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/10/2609d81ff1f18b2d2838604d9c3e0a1f17d144	2609d81ff1f18b2d2838604d9c3e0a1f17d144	file	\N	168	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5ef14f55-c17d-4755-9567-84aea14bb388	46577979-a698-4498-a62a-3de3bc327635	.git/objects/10/75dfa06456595cf6a690841a8549503e477e3e	75dfa06456595cf6a690841a8549503e477e3e	file	\N	174	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4b7382e0-afb6-409f-abda-0949b327cc8d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/10/2fa57526d9e8309ea7503ec899f07b6ee639d2	2fa57526d9e8309ea7503ec899f07b6ee639d2	file	\N	1910	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
dfa0a00a-b9b7-488e-be38-58e02435552d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/98	98	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
68c92f02-6361-4232-a54a-9116a4a3a1ce	46577979-a698-4498-a62a-3de3bc327635	.git/objects/98/2fc932639a8abad972547a1f1ba8b4fe1fdb1e	2fc932639a8abad972547a1f1ba8b4fe1fdb1e	file	\N	974	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d79a711e-f263-4ed5-9e74-32b868522da2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/98/1b1a73b4f006ab47c304f9d7a543270ddd8063	1b1a73b4f006ab47c304f9d7a543270ddd8063	file	\N	187	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
240c4a68-51e0-455e-a44d-399d66973f6e	46577979-a698-4498-a62a-3de3bc327635	.git/objects/67/e41357e264250217fe0838acb58c47f644fdd1	e41357e264250217fe0838acb58c47f644fdd1	file	\N	242	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
219f60f2-774f-40f5-bc6e-73c35bfbe919	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b5	b5	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3dcfe4ad-a482-448f-a196-faf28019ebbc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b5/922b506355fcfad3810b2a2b652a95765aabd5	922b506355fcfad3810b2a2b652a95765aabd5	file	\N	169	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cd6f6d3a-5a13-4adf-8b7d-44ec2cdbf9d6	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b5/c80265841e57c4a3b3f66f0c5007d6c8bd508c	c80265841e57c4a3b3f66f0c5007d6c8bd508c	file	\N	53873	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
544d014b-45da-4b7a-bf33-4f2fb3b761ac	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b5/40e3ea8679b958e8afd20e130b9542f46b910a	40e3ea8679b958e8afd20e130b9542f46b910a	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
82702c3d-7602-4035-b112-6aedf992cf22	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ed	ed	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
dd76e04b-36fd-4281-a292-db457c280f84	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ed/61b99d41368998123468b37a21c652f18cda3a	61b99d41368998123468b37a21c652f18cda3a	file	\N	1131	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
93da26a0-2c42-40ad-ad37-e524202b9dbe	46577979-a698-4498-a62a-3de3bc327635	.git/objects/91	91	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
fe2c601f-081f-4637-8dc2-27472b0c6a10	46577979-a698-4498-a62a-3de3bc327635	.git/objects/91/f93e33360a5742e0b12b477186f26c219d61b4	f93e33360a5742e0b12b477186f26c219d61b4	file	\N	242	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7ab6f168-42e8-4233-a96e-5bf9fcc70b9b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/94	94	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5fbe81ba-b3da-46c6-8c9c-e3f05b4cd9df	46577979-a698-4498-a62a-3de3bc327635	.git/objects/94/23d22b0a45ece6f05b164d1f37702f365a6e77	23d22b0a45ece6f05b164d1f37702f365a6e77	file	\N	170	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d9bd5934-6cee-479c-bf39-e2d87ca20536	46577979-a698-4498-a62a-3de3bc327635	.git/objects/94/dedf1c303be994120578fe735f6a02e3db06f8	dedf1c303be994120578fe735f6a02e3db06f8	file	\N	191	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b725099b-895d-4e8a-bea8-15e82592ef89	46577979-a698-4498-a62a-3de3bc327635	.git/objects/94/a0ff4b4581d880254493c1eec5ab4ccc4cab9e	a0ff4b4581d880254493c1eec5ab4ccc4cab9e	file	\N	99573	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
38581c4a-f2ff-478a-8d9e-5bf590b9cf12	46577979-a698-4498-a62a-3de3bc327635	.git/objects/94/3de9e5f3e1f5aac0c7c89531a819140f84c764	3de9e5f3e1f5aac0c7c89531a819140f84c764	file	\N	80	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b024f6cb-1e4f-4c4a-ada7-683515b1835a	b882b963-bb2e-47a7-b51a-b5ef9ab2af91	Unterordner/and some file here.txt	and some file here.txt	file	\N	0	\N	private	f	f	2026-01-13 20:57:03.078283+01	2026-01-13 21:03:49.961484+01	cad23ca1-121d-448f-8947-ddd5048ecb15
08ea94cb-0021-4b3f-b45f-29abc27495ee	46577979-a698-4498-a62a-3de3bc327635	.git/objects/74/b2ce62f9691f7b531ca2a91b146c6b6b4284f4	b2ce62f9691f7b531ca2a91b146c6b6b4284f4	file	\N	432	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7904115f-ebe0-4b7c-ba01-b6556928f104	46577979-a698-4498-a62a-3de3bc327635	.git/objects/74/18bd3367a4d1f6a366825b849dd78207aa3fef	18bd3367a4d1f6a366825b849dd78207aa3fef	file	\N	577	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9282e756-fa00-488c-bce2-94b3ad045843	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9c	9c	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
726efd73-ef37-43d7-87cb-0e5737410769	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9c/0058753c53539c746c31d1341f4a6101dd617f	0058753c53539c746c31d1341f4a6101dd617f	file	\N	169	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
55fd6b68-c63f-498f-956f-e4caa3aa44a6	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9c/3d23fd6f75db9a660542c417317acc7b89052e	3d23fd6f75db9a660542c417317acc7b89052e	file	\N	9129	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d5457723-95b0-4d7f-bf33-ffe0b4d99285	46577979-a698-4498-a62a-3de3bc327635	.git/objects/fd	fd	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a5d29e2c-9611-40b3-b24f-9393bf13567d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/fd/4e70c3026fbde9b085d07cbc89354eed40a9fa	4e70c3026fbde9b085d07cbc89354eed40a9fa	file	\N	449	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
903bfba8-13a8-4fc5-a1c7-215948d42c34	46577979-a698-4498-a62a-3de3bc327635	.git/objects/fd/bfd883f4014da1a704d4fc27addf8397612ed0	bfd883f4014da1a704d4fc27addf8397612ed0	file	\N	190	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3b5ff6ff-41cd-4ac6-b95e-c8bef276707e	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f3/c1a11385e5500bd95d14170e219747a89b636e	c1a11385e5500bd95d14170e219747a89b636e	file	\N	242	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ea0c9939-5cec-424f-a700-d3be16d48f81	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f3/3c259de9de28bb22ce9a1c756d591d55f652f7	3c259de9de28bb22ce9a1c756d591d55f652f7	file	\N	31811	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
31d86de9-fa6a-4b6f-b126-b14990c00388	46577979-a698-4498-a62a-3de3bc327635	.git/objects/16/d00424d69c6c3ba70d68261d27b799a11a626f	d00424d69c6c3ba70d68261d27b799a11a626f	file	\N	17885	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
52d55a30-b812-4e21-872e-4141bf56a66d	b882b963-bb2e-47a7-b51a-b5ef9ab2af91	Test folder in Test 33	Test folder in Test 33	folder	\N	\N	\N	private	f	f	2026-01-13 20:57:51.444782+01	2026-01-13 20:57:51.444782+01	cad23ca1-121d-448f-8947-ddd5048ecb15
e8172dc2-1e0e-4f94-8c17-d9acddd5e7b3	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ca/34fcdbc82167693495c096797380753ac7c93e	34fcdbc82167693495c096797380753ac7c93e	file	\N	162	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d0d6df9f-3592-459d-837a-2e21b8bf36c2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ca/0ff582a213b43660f8eaec9bed1003b0ae7eeb	0ff582a213b43660f8eaec9bed1003b0ae7eeb	file	\N	525	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
524574c0-fecf-48e4-ace8-3d404a492c93	46577979-a698-4498-a62a-3de3bc327635	.git/objects/13	13	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
58686ad3-4e03-4c66-8f25-83344332c110	46577979-a698-4498-a62a-3de3bc327635	.git/objects/13/429620d810c519a73c9228766511417ab1b4a5	429620d810c519a73c9228766511417ab1b4a5	file	\N	116	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
78ad949c-791a-4090-8cec-78dd3c10e32b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/33	33	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
806c6966-a80c-46b7-ad1f-c1099b6516dc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/33/5e8b9a46fad8cc193eb0b4c4e857f3ac135208	5e8b9a46fad8cc193eb0b4c4e857f3ac135208	file	\N	242	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
45a2e2e2-d6cc-46b8-bb2d-7946d2f85c4d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/33/086df43d298e9b4d8744fe66521535b6db56a9	086df43d298e9b4d8744fe66521535b6db56a9	file	\N	16967	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b0552bb5-50d7-4bb6-bf67-b417dcbcd772	46577979-a698-4498-a62a-3de3bc327635	.git/objects/33/b98b5de8db71c64c6582a394e90deb866cff4e	b98b5de8db71c64c6582a394e90deb866cff4e	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
30bd1a7c-7ef3-4b98-af54-f8b5d8b6278f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/19/5252031461526009a92374b5d9eed33c2efee3	5252031461526009a92374b5d9eed33c2efee3	file	\N	194	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
64ce5d5e-1c71-4f4d-a2de-c41702b3baf9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/19/573cf78682a52fdee43329e9eb0755e568cdf2	573cf78682a52fdee43329e9eb0755e568cdf2	file	\N	174	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b3de2d83-610e-41ce-868a-4d5013dd800a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/19/c7bdba7b1e9bfe80365a50420a6d538ca503c3	c7bdba7b1e9bfe80365a50420a6d538ca503c3	file	\N	17	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3def4b3e-84a9-489a-b168-11e16e83e0cc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/19/d596d2d5a7c9e3ed6b68c7dcdcfa109cd06aa5	d596d2d5a7c9e3ed6b68c7dcdcfa109cd06aa5	file	\N	302	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a0f258da-e7a7-400c-8199-5ee26bc7a0d4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9d/1dd7608bc44463072a73bba2cca81aaf7b840c	1dd7608bc44463072a73bba2cca81aaf7b840c	file	\N	11013	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d6390d42-fcd0-429a-a0a4-e7687f53431b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9d/f913591950e0dae5225e945c26c5b9bed04cde	f913591950e0dae5225e945c26c5b9bed04cde	file	\N	141	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
995d746b-d48f-4c99-81de-4d3cb9bf26fe	46577979-a698-4498-a62a-3de3bc327635	.git/objects/bb	bb	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8c410cbe-667c-44b9-b1ff-fe1b6b5370a4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/bb/dc0a6567675bdf9e97098c3102e744b27dd626	dc0a6567675bdf9e97098c3102e744b27dd626	file	\N	11047	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
363d484b-674f-4856-bcd3-f2b49ab137b0	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5f	5f	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
052f7ae9-f82b-4a2e-aa1b-e260b83486c3	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5f/b97bfb76afd04e52de0ad82c4b9336b9409383	b97bfb76afd04e52de0ad82c4b9336b9409383	file	\N	116	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
74922c64-cefb-4b72-9483-b82bc78e16f3	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5f/f845c8591c8968a2439a2879be463c8f209116	f845c8591c8968a2439a2879be463c8f209116	file	\N	1542	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
228a9a90-ad69-4629-b0c2-3ebea9c886c9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5f/209758cf4b3d86085913bf4d84a52c34353400	209758cf4b3d86085913bf4d84a52c34353400	file	\N	36584	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d68ed19f-661a-4780-a441-0d5a900f3d5d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5f/ddb9bd20d813ab9890c78adb3fcf979aa5a4ce	ddb9bd20d813ab9890c78adb3fcf979aa5a4ce	file	\N	34583	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
fae77628-a257-4135-aa46-21ee10445867	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e7	e7	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f84a1a57-51fa-4b2d-b424-11ec19349b72	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e7/a00fe02fa197568e23bdb7c682c7df22e29c9c	a00fe02fa197568e23bdb7c682c7df22e29c9c	file	\N	242	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a661ec52-3d21-4fe6-bbc8-111cae846c5a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b7	b7	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
37aac6dd-e087-40f2-b72b-d57d7ba8dbb2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b7/481bda5e81b761024eca610b0f948579d14e16	481bda5e81b761024eca610b0f948579d14e16	file	\N	185	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b47f98e0-cc07-437c-aaf6-8ac6ece79dcc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b7/f6369863bd504e34f1f2fe8db17053109400c9	f6369863bd504e34f1f2fe8db17053109400c9	file	\N	176	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
54f913e7-bf98-4518-9629-6bb1a7fcbb9b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/cd	cd	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2ae31205-b04c-478d-93ca-49075db9d415	46577979-a698-4498-a62a-3de3bc327635	.git/objects/cd/e71e1235fec6b54133807461fc782f967ad5a4	e71e1235fec6b54133807461fc782f967ad5a4	file	\N	161	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ec746b72-fc34-4268-b636-dba207111138	46577979-a698-4498-a62a-3de3bc327635	.git/objects/cd/dcecfe6d560cbb7d15c7ee632ea0bf2f2badef	dcecfe6d560cbb7d15c7ee632ea0bf2f2badef	file	\N	4654	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d40f0690-d5e2-4220-9920-b5d167cf3469	46577979-a698-4498-a62a-3de3bc327635	.git/objects/cd/654777b1e480b8e2b36d8050ce60b15e1dcefe	654777b1e480b8e2b36d8050ce60b15e1dcefe	file	\N	12063	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f4b74581-2a19-4f0e-8630-cb59607d1765	46577979-a698-4498-a62a-3de3bc327635	.git/objects/73/084bd2d1a5dee1e5882ff84f689f70b78cf505	084bd2d1a5dee1e5882ff84f689f70b78cf505	file	\N	242	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
23787a73-9861-45ec-8534-0b1a6ddac957	46577979-a698-4498-a62a-3de3bc327635	.git/objects/73/2f17ce338c9b55f2a5355492de6929fbadfdd6	2f17ce338c9b55f2a5355492de6929fbadfdd6	file	\N	39589	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a3b34a33-c6f0-4b85-a73b-b7eb89937a19	b882b963-bb2e-47a7-b51a-b5ef9ab2af91	Locally created folder for Test 33	Locally created folder for Test 33	folder	\N	\N	\N	private	f	f	2026-01-13 20:59:27.49148+01	2026-01-13 20:59:27.49148+01	cad23ca1-121d-448f-8947-ddd5048ecb15
222b5114-018e-4b49-bbcc-d4df378f16e9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/3a/29e813fabb88942a66b86cca42e4a5f5bbe0a1	29e813fabb88942a66b86cca42e4a5f5bbe0a1	file	\N	168	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a00fded1-273b-4751-bfc9-06de66c096d2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2c/52f2bd1df1c40a4804198c76d7c1ece8455c46	52f2bd1df1c40a4804198c76d7c1ece8455c46	file	\N	222	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
72ad0ace-cf61-4da9-8fab-b96b2200ca61	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2c/2a050db2976b980fcd6be38d90d1518bb5f1a5	2a050db2976b980fcd6be38d90d1518bb5f1a5	file	\N	16841	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
78fd02cd-6455-4a9a-a7b0-131b66ca8d20	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2c/1a7c2fd97a8f8f3f428810e988bed4ac486a29	1a7c2fd97a8f8f3f428810e988bed4ac486a29	file	\N	11257	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
32b09541-b14b-4440-b056-7d0dba5d652b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2c/94de58a01375f65a76fc8c91b1359681cb549c	94de58a01375f65a76fc8c91b1359681cb549c	file	\N	649	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
02d14ca2-4689-4a1b-990f-50effe2cfb38	46577979-a698-4498-a62a-3de3bc327635	.git/objects/af	af	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2d93b0cd-8112-4ab2-914d-4b27a0dfaa61	46577979-a698-4498-a62a-3de3bc327635	.git/objects/af/730947dc70d25f43be4a82cca29199dd6969f5	730947dc70d25f43be4a82cca29199dd6969f5	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1c5024f2-ff35-4706-a982-4bf21c3652da	46577979-a698-4498-a62a-3de3bc327635	.git/objects/af/4a03e2a3d9c0e2140edf9cf46a333b5984a465	4a03e2a3d9c0e2140edf9cf46a333b5984a465	file	\N	917	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3f64c3b9-b2d7-4201-b828-e0579427b3c2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/af/3fad9f2ad2f2156959323732900415217af986	3fad9f2ad2f2156959323732900415217af986	file	\N	689	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
86a5f39c-7100-4867-b594-6f36e193201f	b882b963-bb2e-47a7-b51a-b5ef9ab2af91	Locally created folder for Test 33/bla.txt	bla.txt	file	\N	0	\N	private	f	f	2026-01-13 20:59:27.49148+01	2026-01-13 21:03:49.961484+01	cad23ca1-121d-448f-8947-ddd5048ecb15
c76474b7-ee39-45fd-9674-df51aa57b909	46577979-a698-4498-a62a-3de3bc327635	.git/objects/00/6ec57b9813fa19531074033426af94b23c13e5	6ec57b9813fa19531074033426af94b23c13e5	file	\N	174	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
474a78f1-68eb-4acd-b11e-1c3709112b5c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d7	d7	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3ea0bf32-355e-482d-8166-05959b77cc49	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d7/092d04ba69cc6159fe0ffe02d277b30c026a59	092d04ba69cc6159fe0ffe02d277b30c026a59	file	\N	163	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e02f9b28-d922-46e2-b8a2-376285f115fc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d7/05fe50a36ccf7108d280463b16f79181639613	05fe50a36ccf7108d280463b16f79181639613	file	\N	185	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3d522517-e9ca-43a2-9f5e-b52b38f53caf	46577979-a698-4498-a62a-3de3bc327635	.git/objects/3f/33971304db9d079669e2d5a457aa5c8ace7bfc	33971304db9d079669e2d5a457aa5c8ace7bfc	file	\N	16069	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
97fe433f-b995-4250-9320-03345187de86	46577979-a698-4498-a62a-3de3bc327635	.git/objects/3f/b5f360678f372f03ccac1f9b5b260f6f5208ea	b5f360678f372f03ccac1f9b5b260f6f5208ea	file	\N	11143	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ee261ec3-ee8b-4181-9309-6331a34c844e	46577979-a698-4498-a62a-3de3bc327635	.git/objects/3f/fcc6e36afc24538cdbc320402903a70c4756f0	fcc6e36afc24538cdbc320402903a70c4756f0	file	\N	303	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
608bc27c-84f2-4c5c-8c3a-a9bf3d24d3e5	46577979-a698-4498-a62a-3de3bc327635	.git/objects/df/f7ed0e07d159dedb8f7b64de89ed30cbf89fc2	f7ed0e07d159dedb8f7b64de89ed30cbf89fc2	file	\N	7635	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
26d6d3cb-47f8-45c4-82e4-4131722b6603	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ea/1efd4898ae076a49c3102b372d4339e39c863e	1efd4898ae076a49c3102b372d4339e39c863e	file	\N	7786	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
02df4611-0c56-4fb3-b3db-269d641308e4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/17	17	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3eafd155-e2be-4160-b1c3-d644d0ef369b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/17/5c80c5d508fe964027c50fc46b325bfe6c84dd	5c80c5d508fe964027c50fc46b325bfe6c84dd	file	\N	7500	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
55719601-a346-4054-b7f5-0751b0f283a2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/17/bdc8a2d28f523aa6532de159522fb997a6b618	bdc8a2d28f523aa6532de159522fb997a6b618	file	\N	237	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
56b2836b-a1d0-4822-bd12-5ff333383f2b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ff	ff	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
43fb83fd-0eab-476c-8975-d13270fe030a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ff/04085b024d54cb877ac379b7efab0866b6ade7	04085b024d54cb877ac379b7efab0866b6ade7	file	\N	8744	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
96e2904b-3696-4a44-99ab-70d322f84973	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f2/224343e78cc0cde74bf823fdc251610656cfe3	224343e78cc0cde74bf823fdc251610656cfe3	file	\N	7533	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c619f22e-ed52-4c76-b95c-1860c6cd7896	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0f/3c4337e099f16f17a0680015346d858ea8a4ea	3c4337e099f16f17a0680015346d858ea8a4ea	file	\N	14329	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
45d937a1-593c-49f3-8590-3afc884c3bb8	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0f/89bdc3b29d91070f5f44fea0896e65faae1e25	89bdc3b29d91070f5f44fea0896e65faae1e25	file	\N	172	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
05d9db21-f1f5-4964-bdcf-ef8dc31b892d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/20	20	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d98a0384-c82d-4052-91b0-c73eeff14581	46577979-a698-4498-a62a-3de3bc327635	.git/objects/20/f80d144ea8b8e0c89be59b49260aa6f3d28dd2	f80d144ea8b8e0c89be59b49260aa6f3d28dd2	file	\N	9032	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
facbd002-939a-444e-839b-e76a57a2da54	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b6	b6	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5e90ffec-b3bf-44aa-ae19-07bc1a36928f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b6/1c31a15368a52e0c837a239410b17e932e0b41	1c31a15368a52e0c837a239410b17e932e0b41	file	\N	18672	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e7ae75e9-ba96-4193-97ef-bd3ea241e6b4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b6/8206ec1109fe18851d40143ed0ff940ea6ac4a	8206ec1109fe18851d40143ed0ff940ea6ac4a	file	\N	649	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
aa3ebb8e-f1f3-4b38-825d-91861b1bf4aa	b882b963-bb2e-47a7-b51a-b5ef9ab2af91	.crowdly	.crowdly	folder	\N	\N	\N	private	f	f	2026-01-13 22:19:31.636704+01	2026-01-13 22:19:31.636704+01	cad23ca1-121d-448f-8947-ddd5048ecb15
f4869df8-acf0-49c1-b896-7be3f15cba14	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1f/d8aa54cd75f01b1d2b35a76d57722af68720db	d8aa54cd75f01b1d2b35a76d57722af68720db	file	\N	1142	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3970701d-c4d9-44bd-87d4-e2e6ed03f180	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e6	e6	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9923aba4-bd14-44e1-9375-4e4c3a6a60f8	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e6/ef04ba551f7525927fc8ca1826042839e8535d	ef04ba551f7525927fc8ca1826042839e8535d	file	\N	457	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
fc94f853-e5ae-43ca-b46d-4c1b49d47e93	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d1	d1	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b27d5734-4ac2-4470-abe3-78b642f59e95	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d1/9d8feb4db3866708231ef546d59f43dc7cd1a6	9d8feb4db3866708231ef546d59f43dc7cd1a6	file	\N	139	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
36ea6015-1d96-4ffb-8ac4-3424e5f9c373	46577979-a698-4498-a62a-3de3bc327635	.git/objects/71	71	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9faf61ea-f42d-4eb6-a970-6b8af7b426ac	46577979-a698-4498-a62a-3de3bc327635	.git/objects/71/390ebc6a75b4a4bd3ee75fa69c96fb7ccbfc43	390ebc6a75b4a4bd3ee75fa69c96fb7ccbfc43	file	\N	174	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2580ae6a-e0d9-4b30-9b66-d01fd92b151f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/71/2c11502e2112f8738386eab69ba236b8607090	2c11502e2112f8738386eab69ba236b8607090	file	\N	190	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
bf67aba0-6084-4145-8a20-9479b2c52b47	b882b963-bb2e-47a7-b51a-b5ef9ab2af91	.crowdly/some file.txt.seq	some file.txt.seq	file	\N	1	\N	private	f	f	2026-01-13 22:19:31.636704+01	2026-01-13 22:19:31.636704+01	cad23ca1-121d-448f-8947-ddd5048ecb15
ab9f8a5e-9450-4ec1-b83b-fb1d195dcb39	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6b/668c48d04f48b44272fbffec8511b384da8ba1	668c48d04f48b44272fbffec8511b384da8ba1	file	\N	8905	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ca4fe923-35d1-4fc7-9f93-4f6cfd180306	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6b/c14cb080888b66b6b1c586723269a6db1fbea5	c14cb080888b66b6b1c586723269a6db1fbea5	file	\N	12213	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2a046579-6acd-42bd-b4e2-dd17d7a62b13	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6b/1d3601646fe37632c065ccf4be8f3b90031815	1d3601646fe37632c065ccf4be8f3b90031815	file	\N	302	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ccd3be35-c57e-4eea-a8dd-ec674ff57da7	46577979-a698-4498-a62a-3de3bc327635	.git/objects/82	82	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cd1d2c31-7cc8-46fa-a496-d55d9a82baf9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/82/9345b71fd6273e76ebb813d7aaaa3044ab5e30	9345b71fd6273e76ebb813d7aaaa3044ab5e30	file	\N	18646	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
abda3933-038f-49ae-9f6f-c00f7ea04551	46577979-a698-4498-a62a-3de3bc327635	.git/objects/82/4c39afdfa7339287a10a3a7c2cde585e3bea1c	4c39afdfa7339287a10a3a7c2cde585e3bea1c	file	\N	174	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
98b43aaf-4f9c-40a9-a29f-1afc4547c1fa	46577979-a698-4498-a62a-3de3bc327635	.git/objects/69	69	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2bf19c56-2bdc-4e7b-a457-a8b1332107dc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/69/802f2f5f979dd7c150fd1fab0d34ba40aaaf10	802f2f5f979dd7c150fd1fab0d34ba40aaaf10	file	\N	16698	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
76ab6892-d31a-464c-93cb-96149bd60d78	46577979-a698-4498-a62a-3de3bc327635	.git/objects/69/387c42e9ef47023e5902e9e3a99b6debf67c74	387c42e9ef47023e5902e9e3a99b6debf67c74	file	\N	3347	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
34f0396b-0e20-4a78-b739-ec62aafd39b1	46577979-a698-4498-a62a-3de3bc327635	.git/objects/69/11477fdc415d9d67b56eaf98398e0131bd7a79	11477fdc415d9d67b56eaf98398e0131bd7a79	file	\N	116318	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
52af48d5-657a-45ca-a598-6efad47556e2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/69/95523bece50a5138ca3bc2cb8485bb319370e2	95523bece50a5138ca3bc2cb8485bb319370e2	file	\N	80	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6cc3fc5c-937b-4705-96d2-520363d7df90	b882b963-bb2e-47a7-b51a-b5ef9ab2af91	.crowdly/some file.txt.updates.jsonl	some file.txt.updates.jsonl	file	\N	2318	\N	private	f	f	2026-01-13 22:19:31.636704+01	2026-01-13 22:19:31.636704+01	cad23ca1-121d-448f-8947-ddd5048ecb15
56eb79cc-7de3-4e35-857e-22b99a59e84f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2a/9eb91dc2ade8e786313815edcfd6f224cc3d2a	9eb91dc2ade8e786313815edcfd6f224cc3d2a	file	\N	11626	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f2ad2954-5686-4722-9638-7636ecd15787	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2a/54cb6f1dbae26caedc0848b5cf75dbd871c7d8	54cb6f1dbae26caedc0848b5cf75dbd871c7d8	file	\N	80	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6f7cbd69-cab2-4761-8915-89c3c12a7824	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2e/038f83fdfc68b701afec3d61b8a442ddfc7e8f	038f83fdfc68b701afec3d61b8a442ddfc7e8f	file	\N	523	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d0faeb28-e921-452e-9f71-cd7bac4264b4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2e/bb0c692889966d18ecac884167e4d9e7afa2ee	bb0c692889966d18ecac884167e4d9e7afa2ee	file	\N	302	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c978709d-22b4-4d77-97d6-56ea0b3e51b9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/60/1e040ce077083a11c26b1859cb72f639ccb2e0	1e040ce077083a11c26b1859cb72f639ccb2e0	file	\N	139	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b5761705-6d7e-420d-a55c-90f86c1c4bb9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/60/985388b47176bf2520761c12900d6c78057361	985388b47176bf2520761c12900d6c78057361	file	\N	393	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
32a47caa-4022-4696-b569-ab64d667adf7	46577979-a698-4498-a62a-3de3bc327635	.git/objects/47/de25bd6b1ca6c8ff028a7f4ee1cbd2dbdaaf75	de25bd6b1ca6c8ff028a7f4ee1cbd2dbdaaf75	file	\N	177	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d97001ff-42ca-4827-bb8e-d46c4c2c1f70	46577979-a698-4498-a62a-3de3bc327635	.git/objects/47/d90de5c5502cb97fe39e904b516faf933ac050	d90de5c5502cb97fe39e904b516faf933ac050	file	\N	3010	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
244957b0-d14b-476b-9140-c7d72cd4b4b0	46577979-a698-4498-a62a-3de3bc327635	.git/objects/44	44	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
34f20f96-44c9-4c72-a3bc-7607d2e6d389	46577979-a698-4498-a62a-3de3bc327635	.git/objects/44/680dc7b09542d5732ad491d5dbb1f6e3695549	680dc7b09542d5732ad491d5dbb1f6e3695549	file	\N	173	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
64e7ea98-fb07-430e-a5a3-14668107a191	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9b	9b	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
36e6dba5-9181-46fc-9a54-48d32b7d3a16	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9b/48c9735bd9d1fbcfba48d1b469f62ad8861254	48c9735bd9d1fbcfba48d1b469f62ad8861254	file	\N	180	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b4448129-653c-49fc-8688-700a5f778138	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9b/c9ac884884918cd72afb2799bde569443f92ec	c9ac884884918cd72afb2799bde569443f92ec	file	\N	294	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
65396d21-1554-4eb6-8f67-f46b5df6c28c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9b/e2ba23a8691c1b8fcb16e4be4d61c63123246a	e2ba23a8691c1b8fcb16e4be4d61c63123246a	file	\N	80	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9838ff0d-9ea9-420b-9de4-cbba4d2d855a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/64	64	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
62014f74-e885-4641-a7ca-a989bca94fe8	46577979-a698-4498-a62a-3de3bc327635	.git/objects/64/309dd773749c062bce48094a5a102f94d31ef1	309dd773749c062bce48094a5a102f94d31ef1	file	\N	10074	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a0f5ba57-690a-42ef-b005-0a7e9000977a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/64/ed03b3e696d5a2f027c6ac2f0eeb425a972a26	ed03b3e696d5a2f027c6ac2f0eeb425a972a26	file	\N	146	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4f4631d6-4e0a-449c-a1ea-784dc821790d	eb40fcb0-66a6-41b8-afaa-5b4533fdeb44	file in Test 123.txt	file in Test 123.txt	file	\N	23	\N	private	f	f	2026-01-13 22:26:41.459398+01	2026-01-13 22:26:41.459398+01	cad23ca1-121d-448f-8947-ddd5048ecb15
1bc024ca-785c-4525-8a2a-b2653ef1e574	46577979-a698-4498-a62a-3de3bc327635	.git/objects/01/bd42ef7181c887f8df72e7592335ea453a6280	bd42ef7181c887f8df72e7592335ea453a6280	file	\N	12113	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3ce3b299-eee4-4027-9338-da28f75df93b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0b	0b	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
290672f9-2f2e-43a3-a974-8d260aad7d71	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0b/d48355b5a386f403073c96f77e08f626492171	d48355b5a386f403073c96f77e08f626492171	file	\N	524	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ff78b0f7-b814-43b9-8c46-52cdd3df077a	eb40fcb0-66a6-41b8-afaa-5b4533fdeb44	folder in Test 123	folder in Test 123	folder	\N	\N	\N	private	f	f	2026-01-13 22:26:41.459398+01	2026-01-13 22:26:41.459398+01	cad23ca1-121d-448f-8947-ddd5048ecb15
6f4b941e-aaeb-4aba-a5d6-77887dac382c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e1/ba5cd2ba63cfa41883d170224aebba73824849	ba5cd2ba63cfa41883d170224aebba73824849	file	\N	139	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b79437ed-508f-4d34-8452-35e8255f16ef	46577979-a698-4498-a62a-3de3bc327635	.git/objects/bc	bc	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5777f4fb-3b3b-445d-8fe9-2859aca52c49	46577979-a698-4498-a62a-3de3bc327635	.git/objects/bc/956aaffbf2a6774552e9f530de5fc78ef74e43	956aaffbf2a6774552e9f530de5fc78ef74e43	file	\N	201	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b16a9ee2-52d7-4f06-9422-f8b3fb6666ec	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b4/a9d9d8a72c281b5070299d1326661338cdfd59	a9d9d8a72c281b5070299d1326661338cdfd59	file	\N	11488	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ef3a0715-93cd-4d69-ae18-bcc143d05f88	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c9/7576c941f99a963f5fabcb71a5ca2fb638fe22	7576c941f99a963f5fabcb71a5ca2fb638fe22	file	\N	139	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b718bec5-1757-4180-9a19-72a208ac225a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c9/096c85d08498138ba3b5b077e0ec6b1ad2804f	096c85d08498138ba3b5b077e0ec6b1ad2804f	file	\N	41144	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8a0ae340-c1a8-482d-af0c-9924b833e972	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d5	d5	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2ef150b6-f94f-4130-b766-e248989eef4e	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d5/e399ca35130353ccc913605bb70795aafc675b	e399ca35130353ccc913605bb70795aafc675b	file	\N	174	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4f2f771a-f0d4-416f-b43d-f00e02ac8d27	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d5/8bb6659faa6135a0c265438428895413cb4a00	8bb6659faa6135a0c265438428895413cb4a00	file	\N	7064	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a88d4650-0516-4a1c-94f2-6161e340acd3	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d5/6aa4b431bfd963d96d80c6853c6851994270f7	6aa4b431bfd963d96d80c6853c6851994270f7	file	\N	5075	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
bda42f2e-baf9-4f30-95ce-1b99110a6116	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d5/dbf8ea742bc79868d3d2f180fe6b6e8c632ed8	dbf8ea742bc79868d3d2f180fe6b6e8c632ed8	file	\N	81	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8da2a9af-9d39-4253-a82a-098ab093b7fa	46577979-a698-4498-a62a-3de3bc327635	.git/objects/57/b29cdb15d4a7a96cd1ab4c507d4eb9576bbf6b	b29cdb15d4a7a96cd1ab4c507d4eb9576bbf6b	file	\N	176	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0f71aecb-6cc0-4245-89e2-bd7dc4eeb012	46577979-a698-4498-a62a-3de3bc327635	.git/objects/57/ea062b842b321eadd9361b58eabf9fc738e324	ea062b842b321eadd9361b58eabf9fc738e324	file	\N	104337	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
21e8eba9-33f2-4a1f-bed4-90ec2ace7822	46577979-a698-4498-a62a-3de3bc327635	.git/objects/28/a8f7ff6494a92473d27169933977ed0cb95e37	a8f7ff6494a92473d27169933977ed0cb95e37	file	\N	16859	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
492d8ed8-f4a0-4705-8dbd-6c3d102d32a9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6f	6f	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e05fc074-3b16-4a48-a1b0-e7c035baba85	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6f/37c6f9c860dc7387e89ce9ac146218e7c980aa	37c6f9c860dc7387e89ce9ac146218e7c980aa	file	\N	29280	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1b6f1adc-27a2-4e60-bff7-aa911b494ec8	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6f/a55fd709771ea644ea3a3374f4c7f482d7b72d	a55fd709771ea644ea3a3374f4c7f482d7b72d	file	\N	565	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
398f174e-6681-4285-bc99-224c3c8265d7	46577979-a698-4498-a62a-3de3bc327635	.git/objects/38	38	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7f9d32c6-4275-4c5d-9e0f-36fc3ece7ba2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6f/20a9bd833247a8f73e9c236f3bdba5b59f65ef	20a9bd833247a8f73e9c236f3bdba5b59f65ef	file	\N	212	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8468ec41-d9fd-4334-82a2-3a312ffa0ea9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/27/c4a737f384a93c84039136060438478cc5d595	c4a737f384a93c84039136060438478cc5d595	file	\N	50820	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
56f2b0b0-b0e1-485d-9a71-4c17e94c7129	46577979-a698-4498-a62a-3de3bc327635	.git/objects/bf	bf	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
51e824cf-f650-456c-9921-16cec7b6f782	46577979-a698-4498-a62a-3de3bc327635	.git/objects/bf/9135e249906a791d584b9aa9aa1890ed7f2484	9135e249906a791d584b9aa9aa1890ed7f2484	file	\N	529	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
bf7e7029-72cb-4375-ba85-b8f6946225fc	eb40fcb0-66a6-41b8-afaa-5b4533fdeb44	One more folder	One more folder	folder	\N	\N	\N	private	f	f	2026-01-13 22:57:11.126781+01	2026-01-13 22:57:11.126781+01	cad23ca1-121d-448f-8947-ddd5048ecb15
4a0a0307-73b4-4185-b2ed-0ad19ca00644	46577979-a698-4498-a62a-3de3bc327635	.git/objects/03/c7ebd09702c49852b4bb48bd4b3798f032ea39	c7ebd09702c49852b4bb48bd4b3798f032ea39	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a9c0ec27-4829-428d-8f75-3b4e513e07bb	46577979-a698-4498-a62a-3de3bc327635	.git/objects/03/8051c35eb364d49de4b78d41dfb31826ad82ea	8051c35eb364d49de4b78d41dfb31826ad82ea	file	\N	180	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9a237d1a-109f-4e8b-a28b-aef17f1e25e4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/26	26	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6f14e6ab-b373-482b-9c20-00058a35f583	46577979-a698-4498-a62a-3de3bc327635	.git/objects/26/0b18619e02d9f997de03de1a30e127a75cebc8	0b18619e02d9f997de03de1a30e127a75cebc8	file	\N	1603	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
fa66389d-2265-4e85-9255-a1851898c60c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9e	9e	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ef8408a2-382f-4c3f-82d0-014c64e03d68	46577979-a698-4498-a62a-3de3bc327635	.git/objects/9e/befb68ed3d1947b31f307aaa6fd2e92bbcb068	befb68ed3d1947b31f307aaa6fd2e92bbcb068	file	\N	175	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2c37ef34-be9a-467d-b1be-5024acb70d5a	eb40fcb0-66a6-41b8-afaa-5b4533fdeb44	spaces-status.json	spaces-status.json	file	\N	827	\N	private	f	t	2026-01-13 22:57:11.126781+01	2026-01-13 23:22:16.704606+01	cad23ca1-121d-448f-8947-ddd5048ecb15
10c414bd-7755-4f18-9966-fb91476211ef	46577979-a698-4498-a62a-3de3bc327635	.git/objects/4b/549911e21598119f992d8dfc0429e076b6a8cb	549911e21598119f992d8dfc0429e076b6a8cb	file	\N	178	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7c8c2da0-2ae2-4b5e-907f-242f9696c8f8	46577979-a698-4498-a62a-3de3bc327635	.git/objects/4b/6f9c39e5c757bf387d465c53026b336dd8b96c	6f9c39e5c757bf387d465c53026b336dd8b96c	file	\N	17	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
dfd79a21-d479-4ec7-996b-29aac79d12ec	46577979-a698-4498-a62a-3de3bc327635	.git/objects/cc/689e992ed91a5645b773c90e544aea9f158087	689e992ed91a5645b773c90e544aea9f158087	file	\N	40471	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
84d5e605-e2d2-4d95-965b-ead920bb5387	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d4	d4	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
220546ec-640b-478a-ab5b-8f326c546cf4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d4/58926c4cdf6a82aaf8e31119b52fd93787abfe	58926c4cdf6a82aaf8e31119b52fd93787abfe	file	\N	1653	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6f454620-1c60-453c-a712-f2a373e314b5	46577979-a698-4498-a62a-3de3bc327635	.git/objects/02	02	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0e0a4af4-6bc8-40af-a839-e289d392f1ae	46577979-a698-4498-a62a-3de3bc327635	.git/objects/02/daed40108395cab8f72d269c09b5f3e169b895	daed40108395cab8f72d269c09b5f3e169b895	file	\N	528	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
33fd0167-5b5f-4c36-bb9b-8b8df002449f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1e/a7881d7d0d0936e6655190d966f1d2a29a7b42	a7881d7d0d0936e6655190d966f1d2a29a7b42	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
92311e15-a7a4-454a-b671-12ecbe9b81bc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1e/43d56bf2d1684a1820a940ba9242728b2a36cb	43d56bf2d1684a1820a940ba9242728b2a36cb	file	\N	28052	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
050e22fe-9983-476c-b61e-bb1f366ac2cf	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c7/ec638b3cb478d621a0e77972723f220ef211a9	ec638b3cb478d621a0e77972723f220ef211a9	file	\N	174	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f6dc4aaf-f5c5-4952-87da-ae79b9030caf	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c7/930257dfef505fd996e1d6f22f2f35149990d0	930257dfef505fd996e1d6f22f2f35149990d0	file	\N	16	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cb671b5e-3162-4a66-8ca3-0c03a23890b6	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e5	e5	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
fb461f93-f821-45e1-8760-56970532b2aa	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e5/164ad3c1467982d3ae148eccdc5bb4c87cde5d	164ad3c1467982d3ae148eccdc5bb4c87cde5d	file	\N	164	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
dbdd4ec1-e9af-4f19-b857-020b3a5adb7b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e5/d40676a4f165731ad257854e8bf4ebe094bf58	d40676a4f165731ad257854e8bf4ebe094bf58	file	\N	407	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4f01840e-4eaf-412a-a74b-dbb0297d88c7	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e5/67a1117e3e33cbc2dddbe1ac7a603a6ae8b53b	67a1117e3e33cbc2dddbe1ac7a603a6ae8b53b	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2072cbf6-9f1f-4352-9f71-19903113383a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f4/0ff1c29b470f8a0f3172b0dacff5f4cb536730	0ff1c29b470f8a0f3172b0dacff5f4cb536730	file	\N	174	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7c2318db-6d3f-4ec5-9ea1-7196e6fc9300	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d8/f9c2e2ef2c15f34b545fe6b57c3b5004a202a7	f9c2e2ef2c15f34b545fe6b57c3b5004a202a7	file	\N	181	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
86fb1d4c-7298-4119-a200-0d8679e3b668	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0a	0a	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ffa53513-1b05-4699-94c6-eb7f85489ddb	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0a/655ac63a1a593816cf7a071685e3b4fc144b43	655ac63a1a593816cf7a071685e3b4fc144b43	file	\N	16665	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0d994917-b6d0-496c-9920-9661d33bc0b6	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0a/8c65f346ed0d716663220003af1381f0c9d8f4	8c65f346ed0d716663220003af1381f0c9d8f4	file	\N	36811	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2fdcbafa-c651-4fe8-9d38-fa49cdc10dfb	10620730-cec0-4672-80a0-d983b6841abf	1.txt	1.txt	file	\N	0	\N	private	f	f	2026-01-13 23:16:53.923465+01	2026-01-13 23:16:53.923465+01	6fe20d11-0118-43b4-8439-ecd9738c8226
f150471f-dd60-4935-bc72-ff8f4e748b86	46577979-a698-4498-a62a-3de3bc327635	.git/objects/8b/137891791fe96927ad78e64b0aad7bded08bdc	137891791fe96927ad78e64b0aad7bded08bdc	file	\N	16	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
84ed7ce2-1b15-468c-8288-e9842ee7a082	46577979-a698-4498-a62a-3de3bc327635	.git/objects/8b/c9faf26db914f8a04b2d08356dba6705d09222	c9faf26db914f8a04b2d08356dba6705d09222	file	\N	10168	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4e868fd2-909f-41a5-8a56-e98b86838162	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1d	1d	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0ceedabd-ed22-4e2e-aa70-b6d31aad6a62	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1d/c7d22afd1692cca965a56070ce7ff38e4269f7	c7d22afd1692cca965a56070ce7ff38e4269f7	file	\N	16618	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
73b49d32-7c88-450e-ac9f-6cf9b0b33149	46577979-a698-4498-a62a-3de3bc327635	.git/objects/36/e7a8819c7fe3658a7c17923e7ffa98c4540009	e7a8819c7fe3658a7c17923e7ffa98c4540009	file	\N	18566	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
59c8c354-1208-4155-80b9-c24be90c41ca	46577979-a698-4498-a62a-3de3bc327635	.git/objects/36/1228d4c596cd054685d21f5393632a5a4dff46	1228d4c596cd054685d21f5393632a5a4dff46	file	\N	2991	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8c9d853b-8ac0-444e-87ea-020b35e4c916	46577979-a698-4498-a62a-3de3bc327635	.git/objects/70/4401eeeeaa4b4b878dfac0069a1ce4fec868ab	4401eeeeaa4b4b878dfac0069a1ce4fec868ab	file	\N	17844	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e0d3c4b8-7fad-4b3c-8711-1f2f5128d53d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/70/77aec2895e36fddf4cdb2445423c1f95662d47	77aec2895e36fddf4cdb2445423c1f95662d47	file	\N	31195	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
169ebf86-7b1d-4e65-8763-5fd262e989f2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e8	e8	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
85d9871d-2d93-4be2-b04d-f68f4f0c24b2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e8/0385bbeed97143338953daf2ae653df2b292c6	0385bbeed97143338953daf2ae653df2b292c6	file	\N	6758	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
84ea9fd7-f39c-4d63-b877-64a78f224d38	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e8/3267d48d65c8e109903eb7bac28c6e48e37b51	3267d48d65c8e109903eb7bac28c6e48e37b51	file	\N	36500	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
70113b94-e120-4995-b4ff-8e826b75085d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c3	c3	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cdae5a67-4f70-40e2-9e11-70b9d060ded6	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c3/df7bd3e52cceb3e593bb4b6e8e9300e8809b13	df7bd3e52cceb3e593bb4b6e8e9300e8809b13	file	\N	139	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
41df4e02-f7c5-4064-8da2-cb25c6bda223	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1c	1c	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e3127043-ceab-440e-bce1-6b5033f44323	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1c/1b39f95128001f87909bbcaf7e0dfc1ca7e573	1b39f95128001f87909bbcaf7e0dfc1ca7e573	file	\N	208	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0e65647b-9cb1-47a9-9165-bb9c5bb54022	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1c/aec4b5f8ff6f324a2ba9ee9fe4e4f764d8468a	aec4b5f8ff6f324a2ba9ee9fe4e4f764d8468a	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
bead07f1-3ff6-468c-ac46-9509a350e245	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1c/bd7e2cafece3dc0dff00e8a08df5fda064ee6a	bd7e2cafece3dc0dff00e8a08df5fda064ee6a	file	\N	648	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8130b4dc-2e19-4316-a42b-50c05001cd8f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e4	e4	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6b177e2f-1ead-4c4a-9ed1-62cf2a96c872	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e4/5378a7968155425e07e2f050fbc1ba3ece813d	5378a7968155425e07e2f050fbc1ba3ece813d	file	\N	76	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a0ac611d-6eb1-4cfa-80ca-f569eecae177	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e4/d62998e1818e4a758fe5e2f276a250446b00fa	d62998e1818e4a758fe5e2f276a250446b00fa	file	\N	159	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d92b0853-185b-46a3-bf08-feb0b93e0afe	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e4/9e455136b422ddca1be0142e94be0f8fc4b852	9e455136b422ddca1be0142e94be0f8fc4b852	file	\N	20349	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6e48fad3-13ee-4c66-b167-ac245852147b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e4/40e5c842586965a7fb77deda2eca68612b1f53	40e5c842586965a7fb77deda2eca68612b1f53	file	\N	16	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e5ac4860-621e-4f61-87d6-540b5e4f13eb	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f1	f1	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3b21eea8-3c77-434b-8b27-be2a209e60c4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f1/53a79b6b064e618b68f7f4ea6e812830d117f4	53a79b6b064e618b68f7f4ea6e812830d117f4	file	\N	45085	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
42140f2a-b42b-4af0-81d4-67118790219d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f1/d9db5a0ffa4830711340eb3fec5771acc95031	d9db5a0ffa4830711340eb3fec5771acc95031	file	\N	80	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3fbc3f9c-b819-4393-a366-c24ffe8fa8d8	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f1/802edc4ed6bd645d915de5b9cd378b514b2a70	802edc4ed6bd645d915de5b9cd378b514b2a70	file	\N	7847	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
411f8b82-5137-42a0-bd46-5299b284cf1a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/66/6ba72571a8fe27e1c01a31160dcbd142e64363	6ba72571a8fe27e1c01a31160dcbd142e64363	file	\N	14335	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9e007194-88ed-4906-8880-f1178e4e6196	46577979-a698-4498-a62a-3de3bc327635	.git/objects/66/75bb48ac0173c6cab4a69aea0d76add5c2877f	75bb48ac0173c6cab4a69aea0d76add5c2877f	file	\N	32787	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
36b68e92-efee-4a41-ae5c-3245a8a8ced1	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c8	c8	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
72020840-fe1c-48d4-b4d8-f186b6680e7f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c8/04c310e578926e349ed8f6a7be0d9668f6e2a4	04c310e578926e349ed8f6a7be0d9668f6e2a4	file	\N	565	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
088bc0d9-6098-4d92-aad2-e3c688b0ebb0	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e0	e0	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7580ace6-6453-46de-94a7-9491ef27101e	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e0/ec95fa34903cea0c1468052e25a8542b869fa9	ec95fa34903cea0c1468052e25a8542b869fa9	file	\N	243	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1ef1f190-e2cd-4538-bc50-b2ad2f0db012	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e0/797f4e7854b93e93d1026754be3ac5f8b25916	797f4e7854b93e93d1026754be3ac5f8b25916	file	\N	42127	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
efbb0c0c-094e-4b73-ab74-b8d6129532c0	46577979-a698-4498-a62a-3de3bc327635	.git/objects/e0/7dcb41d12f05ae3f8370e8072d0f42d43609bf	7dcb41d12f05ae3f8370e8072d0f42d43609bf	file	\N	199	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
fa432c50-a4e4-4373-9795-843c31466bc5	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5c/1a845c4d70918681ff0e145d760a4697249ab3	1a845c4d70918681ff0e145d760a4697249ab3	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5b5aeed1-74a6-463e-a247-92dadcaa96dd	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5c/7c037a439ab55eea9f6b2056e90892a88d0ee4	7c037a439ab55eea9f6b2056e90892a88d0ee4	file	\N	190	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
37fbebee-1ff2-4e90-8376-e0949ea18cb5	46577979-a698-4498-a62a-3de3bc327635	.git/objects/7b	7b	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8445ec1d-b3e3-4b30-9e38-9adef48b34ce	46577979-a698-4498-a62a-3de3bc327635	.git/objects/7b/091f01f538be7218f195298e9e0270385e84ce	091f01f538be7218f195298e9e0270385e84ce	file	\N	242	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b12eef56-7c6d-4288-91bc-779b3e41aa3d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/7b/5fc2c08ba5189b2d819b6c670b76453bce1ca1	5fc2c08ba5189b2d819b6c670b76453bce1ca1	file	\N	293	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a09b312d-a198-4c46-9635-5bf30636f947	46577979-a698-4498-a62a-3de3bc327635	.git/objects/7b/4c6516e6e5a1620b78be32c85121ab3005a2e2	4c6516e6e5a1620b78be32c85121ab3005a2e2	file	\N	147	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5d9699ba-b709-43b8-96ef-9f3d4d762846	46577979-a698-4498-a62a-3de3bc327635	.git/objects/7b/b12c4195448cd7311e025b1a6373b2f030f58b	b12c4195448cd7311e025b1a6373b2f030f58b	file	\N	695	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5f63dbc3-e08c-4482-b7fb-379e5d4a9c42	10620730-cec0-4672-80a0-d983b6841abf	Test	Test	folder	\N	\N	\N	private	f	t	2026-01-13 23:17:34.118316+01	2026-01-13 23:22:30.363957+01	6fe20d11-0118-43b4-8439-ecd9738c8226
217b20f1-203d-43f0-a233-7f4bebd3a318	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ee/30d2d8674b209302738cb9f1488c3106a4a11d	30d2d8674b209302738cb9f1488c3106a4a11d	file	\N	21963	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
49e880d1-f56a-4270-baef-e03ea28242bc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ee/6f97f42c5e3bffde30522ad22e926cfe74844c	6f97f42c5e3bffde30522ad22e926cfe74844c	file	\N	28750	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
11f15b90-493e-4aca-94ef-c12b83dc20fc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/7d	7d	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
42fb08af-fecc-4ef0-84c4-82d67583a79e	46577979-a698-4498-a62a-3de3bc327635	.git/objects/7d/8457f22163e5cb14001ecd8370c5ea417780c8	8457f22163e5cb14001ecd8370c5ea417780c8	file	\N	449	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6a4ca26f-1269-4829-9e4a-c554767f0380	46577979-a698-4498-a62a-3de3bc327635	.git/objects/7d/f7b0a9b8d98f60152d0fe88a788385b4cf8a34	f7b0a9b8d98f60152d0fe88a788385b4cf8a34	file	\N	602	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ce9a4ec0-17c0-47b2-b050-c0fffb7a4890	46577979-a698-4498-a62a-3de3bc327635	.git/objects/95	95	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
13b1ac08-b468-49aa-8a86-7907092c08ef	46577979-a698-4498-a62a-3de3bc327635	.git/objects/95/5e2d05991075e4db9e97241b997b41cf487e1a	5e2d05991075e4db9e97241b997b41cf487e1a	file	\N	60	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1f72b662-f500-4959-b8e9-85e1c57bd4bf	46577979-a698-4498-a62a-3de3bc327635	.git/objects/05	05	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8746f6ae-b5b2-420f-8214-742bf90ff991	46577979-a698-4498-a62a-3de3bc327635	.git/objects/05/3d67ade7a18eeef24b33259500e24baf08967a	3d67ade7a18eeef24b33259500e24baf08967a	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3c166fc3-0f2b-4c2f-9bc2-43a331e5da06	46577979-a698-4498-a62a-3de3bc327635	.git/objects/05/816f908d841aa965f412bfd41315155d869d7c	816f908d841aa965f412bfd41315155d869d7c	file	\N	41459	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b446b197-eadf-48da-89cc-aae98f935f3d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2f	2f	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
de34e916-47fe-4365-93a4-88533ac9d863	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2f/1c3c92a679dc5228938d0afc91993f6355de7a	1c3c92a679dc5228938d0afc91993f6355de7a	file	\N	271	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cc0769c9-3811-482e-8755-77bbdfaa5fa0	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2f/2d462e78e2bfdcc80e51380e62c78ab9a3dc25	2d462e78e2bfdcc80e51380e62c78ab9a3dc25	file	\N	167	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
fa4ed0b7-7ca5-489c-9cf0-0e9615d1fd81	46577979-a698-4498-a62a-3de3bc327635	.git/objects/2f/5be8887cd49cca403ac788b29bce5cbb7a2a12	5be8887cd49cca403ac788b29bce5cbb7a2a12	file	\N	5966	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4b1bccda-38f2-46bb-9d97-01302093ad06	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6d	6d	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a90e1042-7d2f-47a5-b17d-c5c62841c6ce	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6d/3541d473138943026fb4654f673844d7f4b39b	3541d473138943026fb4654f673844d7f4b39b	file	\N	158	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
72b7a306-aead-4157-8314-2ce07e9d04b1	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6d/997ed1cdd36b3db5dad99625f8a1e17fee72a3	997ed1cdd36b3db5dad99625f8a1e17fee72a3	file	\N	188	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0c668a99-d1b5-4522-b6ef-f1d9be0f9aed	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c5	c5	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ced64f83-b4c9-4944-97fc-2abf304ee4a6	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c5/0405876c48199cfa1458aa8f70022101c9dbf7	0405876c48199cfa1458aa8f70022101c9dbf7	file	\N	35277	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5f115cb1-6324-4531-a14e-5b22c98be64c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/cf/f2bc00b888d5372657e8ffaec2ca94478abba4	f2bc00b888d5372657e8ffaec2ca94478abba4	file	\N	878	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f38f81a5-218f-43ab-b7e6-28611fe03ecb	46577979-a698-4498-a62a-3de3bc327635	.git/objects/cf/f871bb23af1f7dd56cd16ccc83ef4cf6763641	f871bb23af1f7dd56cd16ccc83ef4cf6763641	file	\N	302	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
99c41ac1-3738-4d68-8982-d2385b9b06ed	46577979-a698-4498-a62a-3de3bc327635	.git/objects/4d	4d	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
caf4add7-270a-4e1a-8ffb-fd77ccfed6ad	46577979-a698-4498-a62a-3de3bc327635	.git/objects/4d/7de0e5ec372a16461408c5707f84f08d68c380	7de0e5ec372a16461408c5707f84f08d68c380	file	\N	72	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
626dd19c-d9af-456f-be31-898d77911c42	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0d/fb6d5852fbf64bd2ca2eb22ae299db8dc94568	fb6d5852fbf64bd2ca2eb22ae299db8dc94568	file	\N	648	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4d185c50-474d-4f7a-9695-963ef81b8ce9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0d/13d2c23ae949fbfe83723b1d2657804b4d6418	13d2c23ae949fbfe83723b1d2657804b4d6418	file	\N	7563	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2b03601d-db01-45ad-92e1-fe76a6f61e80	46577979-a698-4498-a62a-3de3bc327635	.git/objects/a0	a0	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f9511015-0822-4607-8858-218d9a54f1d5	46577979-a698-4498-a62a-3de3bc327635	.git/objects/a0/1e1c0841b3f0a259f7840178f45f516bd9d5ce	1e1c0841b3f0a259f7840178f45f516bd9d5ce	file	\N	272	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
88b8b4af-cfcc-4b59-81df-ad983ae1a066	46577979-a698-4498-a62a-3de3bc327635	.git/objects/8f/16184081e322a475783c7bc6807edd1d517334	16184081e322a475783c7bc6807edd1d517334	file	\N	185	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
380ceb46-e69e-4e0c-a864-5ceec4266f6c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/7e	7e	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8e81fae3-6771-467f-aa30-befff9173af7	46577979-a698-4498-a62a-3de3bc327635	.git/objects/7e/cc46cdec5a44d8b061e8abadb3f413b4f25192	cc46cdec5a44d8b061e8abadb3f413b4f25192	file	\N	27468	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
eda8946d-91ae-48a0-87ac-7804b104de5c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/a4/2f887f70921aecb79820208d46f6f623216fca	2f887f70921aecb79820208d46f6f623216fca	file	\N	35123	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8365c14a-4366-49ce-8983-1dee5b6417ff	46577979-a698-4498-a62a-3de3bc327635	.git/objects/46	46	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c5f82e59-770a-47af-b2f4-dbd5329145f1	46577979-a698-4498-a62a-3de3bc327635	.git/objects/46/949f2e93a93ef7971cc744eb7e06463113c45f	949f2e93a93ef7971cc744eb7e06463113c45f	file	\N	23333	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
578360d7-5cc6-4819-b335-6f9b5ffe52d3	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5d	5d	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a31d3886-de55-42c7-ba9f-0e823de88b1f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5d/9de8c74a270fa8480865761b55d4d43761f440	9de8c74a270fa8480865761b55d4d43761f440	file	\N	10551	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1d472e7e-e7cf-4439-ba1b-db994cb5f503	46577979-a698-4498-a62a-3de3bc327635	.git/objects/5d/f6ecbf86b4951fde5926576896465d86b880f7	f6ecbf86b4951fde5926576896465d86b880f7	file	\N	302	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b27e5bb5-517a-4fb1-9511-f839e5977791	46577979-a698-4498-a62a-3de3bc327635	.git/objects/12/c7670ec47232c0f94aa531674689c87cb0a1bf	c7670ec47232c0f94aa531674689c87cb0a1bf	file	\N	11941	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
476c3774-577c-4945-a4ff-0e501dd991de	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ab	ab	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3a6367eb-0034-40e5-b676-43cc4c67006b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ab/5a6a0994bfbf8aa1ef9fd03fdbea801b6df7ae	5a6a0994bfbf8aa1ef9fd03fdbea801b6df7ae	file	\N	7536	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
61094d13-9d46-4822-9995-54c2ed9b39e0	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ab/44356b146e98575c06b9ff1da510b17a4ac921	44356b146e98575c06b9ff1da510b17a4ac921	file	\N	36384	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d8f17bbd-418e-47e2-8062-db6ff5e6c560	46577979-a698-4498-a62a-3de3bc327635	.git/objects/40/d7f5a5662b88fe5ec5815c38c5bdaaf96baf74	d7f5a5662b88fe5ec5815c38c5bdaaf96baf74	file	\N	89985	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9ddad19b-17f2-40d0-b3fb-29509bfcebef	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f5/9b621ce4cd1b17fd87dd612e6372e9c297c3ab	9b621ce4cd1b17fd87dd612e6372e9c297c3ab	file	\N	1900	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
efd6e3ca-4155-4c0e-b5f1-7f0b16be31ac	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f5/5d7a4de81100898d3b913623f55b76eb40fa15	5d7a4de81100898d3b913623f55b76eb40fa15	file	\N	119269	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
772b4413-44ae-4d2a-85da-f745390fcfc1	46577979-a698-4498-a62a-3de3bc327635	.git/objects/85/fb0546bbaad2dbbca9b2936b2cc1dac0a8f603	fb0546bbaad2dbbca9b2936b2cc1dac0a8f603	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
96818ef3-115a-445f-b1ac-9b5bc2f2081c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/85/29568071ed4c4d26556843c96a4e15f78f90a9	29568071ed4c4d26556843c96a4e15f78f90a9	file	\N	303	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0e1ec140-1318-413e-802b-121fedf3f228	46577979-a698-4498-a62a-3de3bc327635	.git/objects/fe	fe	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
728df36a-d73b-47e9-aa78-4510bdf6f679	46577979-a698-4498-a62a-3de3bc327635	.git/objects/fe/b786dfb15d789a7628f5729e90cc7af8442ace	b786dfb15d789a7628f5729e90cc7af8442ace	file	\N	435	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4973b91d-12f7-49ab-9728-6051a2c708d0	46577979-a698-4498-a62a-3de3bc327635	.git/objects/fe/aa2e578bc5e0a49bfa9caabf17799c2367daa4	aa2e578bc5e0a49bfa9caabf17799c2367daa4	file	\N	14471	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f7d050bd-ebee-45bd-95f7-b5a6723d07b4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/09	09	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
87010fea-aceb-49de-8bce-e606f7dc8e0b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/09/34eec12da24eb26fd1d10e640457a50a22cf7d	34eec12da24eb26fd1d10e640457a50a22cf7d	file	\N	166	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e111e583-d38c-4d2e-b422-83f51e647656	46577979-a698-4498-a62a-3de3bc327635	.git/objects/09/5ef3f01faffdc35cbcaa1ac37b88ce25c2fbbd	5ef3f01faffdc35cbcaa1ac37b88ce25c2fbbd	file	\N	303	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e1e61981-0af3-4e51-b25d-bef0b9322215	46577979-a698-4498-a62a-3de3bc327635	.git/objects/09/73804c41c39805888c4929d03b076c4e5a2247	73804c41c39805888c4929d03b076c4e5a2247	file	\N	18	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
afe50995-dc14-400b-9897-9cdbe3a55186	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f0/dacd5bd81382cca113d21dd135bec064b5d99c	dacd5bd81382cca113d21dd135bec064b5d99c	file	\N	921	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2be9013c-a83d-4909-9dcc-70dc280eb11a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f0/080f4879759c6ad63a1ec321c42cf461f9817b	080f4879759c6ad63a1ec321c42cf461f9817b	file	\N	212	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0514205a-3ce7-4e9a-8042-a6a7933c1566	46577979-a698-4498-a62a-3de3bc327635	.git/objects/f0/2803df5aac5ca6fc81c2c88baad163334244d8	2803df5aac5ca6fc81c2c88baad163334244d8	file	\N	293	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f3c6059c-fcdf-4ebb-af6c-b229e8b03d35	46577979-a698-4498-a62a-3de3bc327635	.git/objects/1a/fbe456e801b02b0485c7cb3522b9f8a0c41a97	fbe456e801b02b0485c7cb3522b9f8a0c41a97	file	\N	18167	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
10bf84d4-747a-444b-a2cd-df317d5b09ba	46577979-a698-4498-a62a-3de3bc327635	.git/objects/86	86	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
86f6814c-70ac-4b30-a655-8fc6abfc9bdd	46577979-a698-4498-a62a-3de3bc327635	.git/objects/86/7d270fa9be222785456babac27d423107b6580	7d270fa9be222785456babac27d423107b6580	file	\N	140	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
48fa140e-3540-43ed-b6ba-63ad1410aa8a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/32	32	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c01af603-3ebd-40d3-acc3-ab6ef6625e83	46577979-a698-4498-a62a-3de3bc327635	.git/objects/32/cdfcf60475e8a7c7c5223ff614cef6f4dcd5f5	cdfcf60475e8a7c7c5223ff614cef6f4dcd5f5	file	\N	149	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1bd82a92-52a3-4eb3-97f5-53cb487fc36d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c1	c1	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
067af31b-3239-4da4-8ae1-9774f3c35f13	46577979-a698-4498-a62a-3de3bc327635	.git/objects/c1/d78ecbc83d8291c24c174f359405b203192ee8	d78ecbc83d8291c24c174f359405b203192ee8	file	\N	289	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
db4f937c-1f74-4a02-8774-b9feecfa670e	46577979-a698-4498-a62a-3de3bc327635	.git/objects/14	14	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
14cb0c23-08b1-482b-bd77-e060f0a502f9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/14/b731c486eb934ec5a05a07bfa9ee59ad49f9aa	b731c486eb934ec5a05a07bfa9ee59ad49f9aa	file	\N	271	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cec1f36a-f586-422a-9aef-bbaf61dfef90	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6c/cd45c1dffec9bc337323a65c798a721ef899b2	cd45c1dffec9bc337323a65c798a721ef899b2	file	\N	168	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
02f6e263-3f47-4a87-a041-243a45ced4d6	46577979-a698-4498-a62a-3de3bc327635	.git/objects/db	db	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ac04019f-ade8-41d9-822d-c16cfcf0f326	46577979-a698-4498-a62a-3de3bc327635	.git/objects/db/500d9da77a54e9d869a2374575e5d5512dc5ca	500d9da77a54e9d869a2374575e5d5512dc5ca	file	\N	2999	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
91f42da1-2a26-41ee-8be4-4170797d66c3	46577979-a698-4498-a62a-3de3bc327635	.git/objects/db/696853bf834d0d1cdfa39591703908d339d8f1	696853bf834d0d1cdfa39591703908d339d8f1	file	\N	212	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
065482c5-345c-4d94-aaab-f873aecd13a8	46577979-a698-4498-a62a-3de3bc327635	.git/objects/23	23	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2d2bcc77-463f-461b-9b8d-ed2089029022	46577979-a698-4498-a62a-3de3bc327635	.git/objects/23/f8d46b633df7cf049b8f2147414577e7c0cf31	f8d46b633df7cf049b8f2147414577e7c0cf31	file	\N	320	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
261830da-66ef-443b-894e-e28d571c400c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/23/8a310a87af00bab2584b09448d5c672b2d3f6d	8a310a87af00bab2584b09448d5c672b2d3f6d	file	\N	648	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d89661a1-8836-4e42-9699-327d659b2ed2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/23/52b4164918dc90924a1c129b175474d1671df9	52b4164918dc90924a1c129b175474d1671df9	file	\N	2223575	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
13b168d7-5441-4622-8f28-3ead4c306228	46577979-a698-4498-a62a-3de3bc327635	.git/objects/23/9af07217a41380dfb31e81d83b26697e0f35cd	9af07217a41380dfb31e81d83b26697e0f35cd	file	\N	2205	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a2ea7c11-887b-4cc7-ae3c-29115310778c	46577979-a698-4498-a62a-3de3bc327635	.git/objects/25	25	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5dfb27a5-2198-4808-9683-24cf9a894109	46577979-a698-4498-a62a-3de3bc327635	.git/objects/25/bf17fc5aaabd17402e77a2b16f95fbea7310d2	bf17fc5aaabd17402e77a2b16f95fbea7310d2	file	\N	17	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d2f2afb7-64ba-48ec-a17f-67d6cacacb05	46577979-a698-4498-a62a-3de3bc327635	.git/objects/75/e6e2958b803c83af059f4d2389dbdd421ce45c	e6e2958b803c83af059f4d2389dbdd421ce45c	file	\N	227141	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2a946546-d9a8-44c6-877e-63ea6fec74f5	46577979-a698-4498-a62a-3de3bc327635	.git/objects/6e/f285b1b03f551e2d145465cf0d585b82a862e3	f285b1b03f551e2d145465cf0d585b82a862e3	file	\N	4297	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d0e91436-89a6-4979-93a5-4c61c64b0da0	46577979-a698-4498-a62a-3de3bc327635	.git/objects/41	41	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4e880f3c-643e-4476-9b7b-5af425352fc2	46577979-a698-4498-a62a-3de3bc327635	.git/objects/41/dc9295d9a676c8f0e434a95f986a5a03818ff2	dc9295d9a676c8f0e434a95f986a5a03818ff2	file	\N	207	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
0fe5789d-9cbb-45e3-8168-c4760675a2a9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/61/a415d66b07fc71218cecde2d72f5b4b00be01a	a415d66b07fc71218cecde2d72f5b4b00be01a	file	\N	168	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e2459f70-4753-4bef-8f28-474de91e171a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d9/9e90eb9675f72290ba32fbf844c1cb45c72718	9e90eb9675f72290ba32fbf844c1cb45c72718	file	\N	17	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
bcc261b0-ae0c-4730-9468-0191be633140	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d9/3b97fa215782db45ce5c578947e4d3dd70e8db	3b97fa215782db45ce5c578947e4d3dd70e8db	file	\N	5950	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f3f7cff7-98a8-4542-bf81-a71830539bd9	46577979-a698-4498-a62a-3de3bc327635	.git/objects/b3/09d4ff0188629e29ffad05e34a4a7ffca0c3a1	09d4ff0188629e29ffad05e34a4a7ffca0c3a1	file	\N	402272	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6a8152e4-183e-4ed9-9f87-8fab323b4eb1	46577979-a698-4498-a62a-3de3bc327635	.git/objects/88	88	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
676c245b-41da-4357-b532-604ea959cc67	46577979-a698-4498-a62a-3de3bc327635	.git/objects/88/664a9a390f4bf4935051dccac4ce4f733640bf	664a9a390f4bf4935051dccac4ce4f733640bf	file	\N	4613	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2f42a3bc-32ed-4bb1-af74-c7080f33e799	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d2	d2	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
89551811-2bf2-4af5-a9df-026012b39fdc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d2/45355c09df822a7f19d2d5c9e75476e30afd3f	45355c09df822a7f19d2d5c9e75476e30afd3f	file	\N	918	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4381da91-6890-4ee6-8074-7c04be70ba98	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d2/e4d7b68d9b2b691558cd171d1c8e8652088554	e4d7b68d9b2b691558cd171d1c8e8652088554	file	\N	191	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1047361a-aecd-47b1-9da8-fbde7dd6c1fd	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ae/9630110745d04dd68b8733ff02b222c715edc9	9630110745d04dd68b8733ff02b222c715edc9	file	\N	465	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c2c42e8c-186a-4aaa-9431-807233b4e3dc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/be/86c023985345167c09d95f871d3aa3cda8ae27	86c023985345167c09d95f871d3aa3cda8ae27	file	\N	313	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6f21334c-bfef-4689-a583-331b6e77a14b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/4e/1f0c1264ca08461947d4869193abba2ae57879	1f0c1264ca08461947d4869193abba2ae57879	file	\N	80	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c3d7a50e-3132-44da-a3f8-e7e47362599f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/4e/9b4b00d8c970ca036c99acfe72b2eb34f91e98	9b4b00d8c970ca036c99acfe72b2eb34f91e98	file	\N	81	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9ad9985f-a8e6-4321-81f2-1efaf314f589	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ba/3693359ceadb4ec9512d7ec9e51682c796091d	3693359ceadb4ec9512d7ec9e51682c796091d	file	\N	160	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
543139c3-632b-4da7-aa36-d8e9031cf786	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ba/3e9ca4c42be9752f14b33875667d4d3f045be7	3e9ca4c42be9752f14b33875667d4d3f045be7	file	\N	1857871	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c7382db7-ce8c-4040-91b6-f992ccf3fa47	46577979-a698-4498-a62a-3de3bc327635	.git/objects/39	39	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6321441b-2ddf-4f4c-9bc0-ae5f2d50f92d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/39/c783126fd85c6b3bb3460e3a8421cc67db7cfa	c783126fd85c6b3bb3460e3a8421cc67db7cfa	file	\N	5269	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
233cf572-4da7-4721-b203-7e72886cb751	46577979-a698-4498-a62a-3de3bc327635	.git/objects/39/40fba4acd042e9c0215de347fb8c8e9b1f8a50	40fba4acd042e9c0215de347fb8c8e9b1f8a50	file	\N	9859	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8dd6756a-baea-4354-8be0-66cebc56223e	46577979-a698-4498-a62a-3de3bc327635	.git/objects/fc/789eb3cf61e0498050a131a3fa2582d9d00175	789eb3cf61e0498050a131a3fa2582d9d00175	file	\N	139	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
01054b94-b4ef-4489-8d6c-ca5c2e2b228a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d3	d3	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3964b10c-58c1-4ce5-8933-b8b001446413	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d3/e8d8d214b6fa6b8b34dd1800f4bc7ee15bb620	e8d8d214b6fa6b8b34dd1800f4bc7ee15bb620	file	\N	312	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1d5b3a29-be13-44ed-a479-c9c302b3bbbc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/7a/2e9d9bc5c6f1ef87805c1efc3c6f7b031c615a	2e9d9bc5c6f1ef87805c1efc3c6f7b031c615a	file	\N	156	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
92ac1ac5-bd35-4d8d-9e1b-af00f73059f8	46577979-a698-4498-a62a-3de3bc327635	.git/objects/24/391408e37bbce08436c9ba4b57e01d6fd7f30a	391408e37bbce08436c9ba4b57e01d6fd7f30a	file	\N	9860	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
174f552f-2283-42e6-8626-c3fbfd6e515f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/24/57e25b4694e094e138ca5661c908d84bc949a0	57e25b4694e094e138ca5661c908d84bc949a0	file	\N	25703	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
fee92abc-b69e-4091-a787-a3f0bd75a93a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/fb	fb	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
89269b58-25b1-48ff-bd5e-26d10f2d0e2d	46577979-a698-4498-a62a-3de3bc327635	.git/objects/fb/5ea872753bf952978268291640314fa85a9011	5ea872753bf952978268291640314fa85a9011	file	\N	31343	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9c215754-8d80-4793-bc4b-a934c92486f7	46577979-a698-4498-a62a-3de3bc327635	.git/objects/21/2e3896961c30bc8d30c785cc37a266c4735181	2e3896961c30bc8d30c785cc37a266c4735181	file	\N	46990	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
58f6825f-a5e8-4dd2-870a-6b079905f1a7	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d0	d0	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
41a7a9f6-3610-4d02-8f20-70b1cdb4b28f	46577979-a698-4498-a62a-3de3bc327635	.git/objects/d0/f42d241c17014524db05b2b7d3adce6319949b	f42d241c17014524db05b2b7d3adce6319949b	file	\N	171	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
77f5102b-779e-4abb-be4b-2f7dd8651fec	46577979-a698-4498-a62a-3de3bc327635	.git/objects/65	65	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6971583e-bbe0-4772-9343-dfda50754e3e	46577979-a698-4498-a62a-3de3bc327635	.git/objects/65/42f461f23717595aba25d178af248d3c3d939e	42f461f23717595aba25d178af248d3c3d939e	file	\N	80	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
55cc32c9-92e6-4c19-a1a0-fe326fd61568	46577979-a698-4498-a62a-3de3bc327635	.git/objects/4c/3b553afcf8cafdd7a961ecbb503488dab40da0	3b553afcf8cafdd7a961ecbb503488dab40da0	file	\N	19874	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7926e4c6-7e07-438f-8d48-03208d274d2a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/bd	bd	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e55b0295-af0f-4f22-baa1-3d05f5bf74e3	46577979-a698-4498-a62a-3de3bc327635	.git/objects/bd/80096fd52767ecc61b57d55b962cb4e8e5d045	80096fd52767ecc61b57d55b962cb4e8e5d045	file	\N	13469	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
51219bbd-bbad-4c96-bc77-3761b3df577a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/38/b99ad7d2c2a1f7615847218392dadf83edba05	b99ad7d2c2a1f7615847218392dadf83edba05	file	\N	25817	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cb87be4e-3ce9-4cf4-a7f0-4a84cec3f22b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/76/0c2577300f2b07d733c7c0a194fbc836ecc767	0c2577300f2b07d733c7c0a194fbc836ecc767	file	\N	11236	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
325e628d-02af-43a9-a41e-476bb28a51f1	46577979-a698-4498-a62a-3de3bc327635	.git/objects/ec/23c1fd4e1b52afc9eedf05ce5800530df6c089	23c1fd4e1b52afc9eedf05ce5800530df6c089	file	\N	25515	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
182a84de-0d6d-46d6-ac37-76ba9d368741	46577979-a698-4498-a62a-3de3bc327635	.git/objects/3c/67aeb198289d0af06822c1d0e4141881914db2	67aeb198289d0af06822c1d0e4141881914db2	file	\N	37343	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
41c4e960-7dcd-4a29-a75f-986ab55d9cd4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/35/e7dd571c48848b8c128680ef0ddce45167f606	e7dd571c48848b8c128680ef0ddce45167f606	file	\N	17556	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
377f0b5b-6331-484e-9ea6-69f48a2c951a	46577979-a698-4498-a62a-3de3bc327635	.git/objects/63	63	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d5d928f6-a9a2-41e5-974a-0ac6ef3dbddc	46577979-a698-4498-a62a-3de3bc327635	.git/objects/63/3172b38ffcbd677bc731a92f0fb74fcd5989ec	3172b38ffcbd677bc731a92f0fb74fcd5989ec	file	\N	10830	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
453504ab-9fdc-44cf-832f-3339a872ec54	46577979-a698-4498-a62a-3de3bc327635	.git/objects/79	79	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c4c56301-52e3-4527-b654-05a0e56c0ae4	46577979-a698-4498-a62a-3de3bc327635	.git/objects/79/6ecf17311040e87753d9191e138c90bfd1a083	6ecf17311040e87753d9191e138c90bfd1a083	file	\N	1422	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b164ede2-31bc-4a7d-9de7-49b61de95475	46577979-a698-4498-a62a-3de3bc327635	.git/objects/4a/d5d8871c3cce76952824e123ac72d637a79a05	d5d8871c3cce76952824e123ac72d637a79a05	file	\N	292	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
08d39bb6-3abe-47f7-94a1-0a70c80a827b	46577979-a698-4498-a62a-3de3bc327635	.git/objects/30/37fc4f563a643eddfc3d9ec3e0b38f6eee7960	37fc4f563a643eddfc3d9ec3e0b38f6eee7960	file	\N	312	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e1eb5072-b9b8-42aa-8210-12810ddcdf95	46577979-a698-4498-a62a-3de3bc327635	.git/objects/30/b29e8937d739752f9302e5089277fd7859136f	b29e8937d739752f9302e5089277fd7859136f	file	\N	18331	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
bfd35d26-a9d9-45d5-9a57-659e89f8dca3	46577979-a698-4498-a62a-3de3bc327635	.git/objects/89/5ca8704e4f32977ce57500bd0ab481003c8565	5ca8704e4f32977ce57500bd0ab481003c8565	file	\N	303	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
04c47708-9f9d-45c5-bcd3-33e9907995ce	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0c	0c	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3805a1a9-bbbc-49e3-aa1e-42273ef4c650	46577979-a698-4498-a62a-3de3bc327635	.git/objects/0c/4cc6c510c3f2bb252a48319f244afe8c80050e	4cc6c510c3f2bb252a48319f244afe8c80050e	file	\N	161	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ebf43d6d-bc0f-4482-a7bd-36a6455696af	46577979-a698-4498-a62a-3de3bc327635	.git/objects/68/73ed69690bc23080809384b12901085e43d25f	73ed69690bc23080809384b12901085e43d25f	file	\N	80	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ab093542-d0dc-4268-8a15-3d948b208160	46577979-a698-4498-a62a-3de3bc327635	.git/objects/a3/22aa4bd8a81a857c94f7fd56368557d55837f9	22aa4bd8a81a857c94f7fd56368557d55837f9	file	\N	302	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
fdf860af-b7e5-48f3-bdf8-6470905cb962	46577979-a698-4498-a62a-3de3bc327635	.git/logs/refs/remotes/origin/main	main	file	\N	6321	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5bd5e683-8d72-4d09-9584-cfaddc042520	46577979-a698-4498-a62a-3de3bc327635	.git/logs/refs/heads/main	main	file	\N	7906	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c513a7c3-0cfc-46c2-a8e8-5bed19993904	46577979-a698-4498-a62a-3de3bc327635	.git/gitweb_	gitweb_	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
107f4f6a-3e53-4477-8fdf-ec008e54927e	46577979-a698-4498-a62a-3de3bc327635	.git/gitweb_/gitweb_config.perl	gitweb_config.perl	file	\N	240	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d19ff17b-38cf-4079-b61f-bd1e22ad5136	46577979-a698-4498-a62a-3de3bc327635	.git/gitweb_/lighttpd.conf	lighttpd.conf	file	\N	3037	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
24bb18d4-5475-40e6-b6d5-b64d3600d0fd	46577979-a698-4498-a62a-3de3bc327635	.git/gitweb_/tmp	tmp	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c2c0ed6e-1fde-4b6b-8f2b-171603938419	46577979-a698-4498-a62a-3de3bc327635	.git/gitweb_/lighttpd	lighttpd	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
dac86ebb-d615-4c6f-ad90-ca957d944038	46577979-a698-4498-a62a-3de3bc327635	.git/gitweb_/lighttpd/error.log	error.log	file	\N	148	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f24ce360-e07f-45c6-9f4a-d72854aaad50	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay	Screenplay	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
91c92eb5-676d-44e8-9236-abc8352436d5	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/brainstorming.md	brainstorming.md	file	\N	163	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cd2d6da9-b769-41ba-bd6e-fca6ffb6f998	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/README.md	README.md	file	\N	257	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9339379d-e3e3-484b-b02a-a59c6396b706	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/canvas_veronika-decides-to-live-260104_1412.pdf	canvas_veronika-decides-to-live-260104_1412.pdf	file	\N	268592	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a636e522-99f6-40fe-b271-071536a0ab97	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Veronika_decides_to_live.pdf	Veronika_decides_to_live.pdf	file	\N	56455	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9412b99f-b8ba-48a6-af50-939b334403cf	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/veronika-decides-to-live-260104_1413-edited.md	veronika-decides-to-live-260104_1413-edited.md	file	\N	12051	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f61d0b2a-b83b-4b99-8ab3-7047032aef62	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Veronika_decides_to_live.fountain	Veronika_decides_to_live.fountain	file	\N	12003	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ab897139-a3e9-4bab-b509-2eef0ac7b8f3	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Veronika_decides_to_live.fdx	Veronika_decides_to_live.fdx	file	\N	25685	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
df02d6f9-9cfb-46bb-8660-ee4844994063	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/veronika screenplay.master	veronika screenplay.master	file	\N	15936	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
54546f43-2dad-474e-81c2-74d500f7fb3a	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/veronika chapters outline for screenplay.md	veronika chapters outline for screenplay.md	file	\N	15835	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
598479dd-c0ed-4c18-811b-82af4676724f	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly	.crowdly	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2c588b7c-2409-4a0a-9cb4-e8fc1d1f644c	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/story-board-260103_2043-milanote-export_edited-for_accuracy.md.seq	story-board-260103_2043-milanote-export_edited-for_accuracy.md.seq	file	\N	2	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ea280819-a735-4b98-aed2-3f3fec2d6f91	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/story-board-260103_2043-milanote-export_edited-for_accuracy.md.updates.jsonl	story-board-260103_2043-milanote-export_edited-for_accuracy.md.updates.jsonl	file	\N	732011	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e0d89b96-6cdf-46be-b3c9-149566e473b1	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/story-board-260104_1301.md.seq	story-board-260104_1301.md.seq	file	\N	2	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d3a84083-8420-423b-be75-61f2d39b1096	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/story-board-260104_1301.md.updates.jsonl	story-board-260104_1301.md.updates.jsonl	file	\N	1200011	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
05719de3-17fa-4a02-bb4b-47d8f941134e	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/veronika-decides-to-live-260104_1413-edited.md.seq	veronika-decides-to-live-260104_1413-edited.md.seq	file	\N	3	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
48149767-b9df-4685-b522-7224c63dad6c	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/veronika-decides-to-live-260104_1413-edited.md.updates.jsonl	veronika-decides-to-live-260104_1413-edited.md.updates.jsonl	file	\N	11025799	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ae1cf3c5-1387-48ce-8986-7b0a736bbc93	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/brainstorming.md.seq	brainstorming.md.seq	file	\N	1	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
aa1e5883-0bfa-4c65-be88-01ab85b5b244	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/brainstorming.md.updates.jsonl	brainstorming.md.updates.jsonl	file	\N	3466	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3ac85e2f-f0ce-49d3-bfd5-13431f072ee2	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/veronika screenplay.master.seq	veronika screenplay.master.seq	file	\N	3	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f598f100-e737-4c8c-b461-705da48db91b	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/veronika screenplay.master.updates.jsonl	veronika screenplay.master.updates.jsonl	file	\N	1480098	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
28e383de-b3e3-41fc-acff-a0b71d51e654	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/veronika screenplay.md.seq	veronika screenplay.md.seq	file	\N	2	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
78ce0474-d961-474e-9382-5821b62a5972	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/.crowdly/veronika screenplay.md.updates.jsonl	veronika screenplay.md.updates.jsonl	file	\N	2583455	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cc9a9e4d-4900-4cd1-81b4-29319061e934	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports	Milanote exports	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
815cb8ca-8a37-47f0-98cc-2b74671008f7	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports/story-board-260103_1324 (milanote export).md	story-board-260103_1324 (milanote export).md	file	\N	3727	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c9b48b36-485c-43fb-b2b6-453a86894165	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports/story-board-260104_1134.md	story-board-260104_1134.md	file	\N	6388	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e8c8e37c-838e-4abc-a37e-6865316c0655	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports/canvas_story-board-260104_1134.pdf	canvas_story-board-260104_1134.pdf	file	\N	236470	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d17e3d53-9982-439c-858c-7522947f60e2	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports/story-board-260103_2043-milanote-export_edited-for_accuracy.md	story-board-260103_2043-milanote-export_edited-for_accuracy.md	file	\N	5709	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3fa6cca2-350a-47f3-8c16-c49f003fe457	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports/story-board-260103_2043-milanote-export.md	story-board-260103_2043-milanote-export.md	file	\N	5709	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e3bfe12a-4667-4c5b-95ef-076ef65b3f00	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports/canvas_story-board-260103_2042.pdf	canvas_story-board-260103_2042.pdf	file	\N	222584	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c7e80a01-c473-4243-8547-e6af7f9c3f36	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports/story-board-260103_1324 - milanote export post-edited for accuracy.md	story-board-260103_1324 - milanote export post-edited for accuracy.md	file	\N	3730	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1bfa3fee-2d71-4b0e-9ad1-57b1786c4943	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports/canvas_story-board-260103_1324- milanote-export.pdf	canvas_story-board-260103_1324- milanote-export.pdf	file	\N	183344	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2cccfa53-7a37-401c-8ccb-df66823a898e	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports/story-board-260104_1301.md	story-board-260104_1301.md	file	\N	8385	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c2ae72aa-ef77-4d06-8679-e79b9f7495a9	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports/canvas_story-board-260104_1300.pdf	canvas_story-board-260104_1300.pdf	file	\N	261630	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4347cdfb-d3ac-4d20-9c89-d479b946256b	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/Milanote exports/veronika-decides-to-live-260104_1413.md	veronika-decides-to-live-260104_1413.md	file	\N	9093	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6f44b475-1b8e-4726-9b3c-7b6ce6eb59aa	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes	scenes	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
93e3cc9c-b92c-47a6-9bda-b97b57458b83	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/untitled-20260110-143538.md	untitled-20260110-143538.md	file	\N	63	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9f3a7340-132d-41fd-b155-93c2f3e01ff6	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/untitled-20260110-142835.md	untitled-20260110-142835.md	file	\N	54	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
335b7955-01f3-4a14-bc8f-be8d4508f3f3	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Now - it’s time to live without fear.md	Now - it’s time to live without fear.md	file	\N	164	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
fa881e60-b102-42b0-88fb-5ad1b5187eb3	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Iceland.md	Iceland.md	file	\N	33	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a8112986-9d75-4a98-a6ac-86baa5a20faa	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Latin America.md	Latin America.md	file	\N	36	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b6b5df65-6741-4ba2-a0db-06e88e40f7f9	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/One, two, three - swimming we go.md	One, two, three - swimming we go.md	file	\N	69	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2c339cde-0b63-43ec-8efd-c318cb07f3c0	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Journey into friendship with cold begins.md	Journey into friendship with cold begins.md	file	\N	1763	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7641786a-4647-4e86-b9c0-3ab46c2b328a	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Spain, here I come.md	Spain, here I come.md	file	\N	272	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ff62eefd-bdc1-4281-a02a-ccbb4e467a3e	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/title.md	title.md	file	\N	0	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ca93f905-79ab-4ab1-91a5-e37eaba48aef	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Life goes on.md	Life goes on.md	file	\N	1186	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c1e68f50-b7b5-4964-add5-f867ca243587	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Apocalypse now.md	Apocalypse now.md	file	\N	101	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a64243e5-87f3-4905-b15c-ece64d1dce50	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/What's next.md	What's next.md	file	\N	528	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
b5f4620b-6785-480d-bcde-4431f652d4a0	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Preparing for India.md	Preparing for India.md	file	\N	2923	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9b85b855-5edd-466a-ba27-0f86b5674842	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/India.md	India.md	file	\N	1962	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f4e8ad50-6b31-41a4-a46d-af0a1ffdba6c	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Some years of life (after India).md	Some years of life (after India).md	file	\N	284	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
96efb2fb-aa68-4a34-87ad-6064c322e5cf	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/India again.md	India again.md	file	\N	271	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2918242e-4c53-4af9-a11e-4836adac737f	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Rush for life.md	Rush for life.md	file	\N	444	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2339810a-1a23-421e-8efc-a36272813f31	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Veronika decides to live.md	Veronika decides to live.md	file	\N	340	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
fde6b244-0064-4ea9-8649-3a861127d6a7	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Screenplay/scenes/Wild wild everything.md	Wild wild everything.md	file	\N	432	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d6ba8b88-51cf-4034-9479-81787efff0c7	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel	Novel	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
94a22274-5836-411d-9f7a-20e260229a21	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/title.odt	title.odt	file	\N	12697	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
937e74f2-a123-4889-bf68-0c4564637fea	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/veronika decides to live.odm	veronika decides to live.odm	file	\N	16643	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e5d9559d-ee73-4797-aa46-9637caa225ce	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters	chapters	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
59ec8bb5-405d-4f08-ab16-5c3522a3a46a	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/intro.odt	intro.odt	file	\N	14030	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c9be33a2-f890-467d-b467-124bb54bfcd5	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/outro.odt	outro.odt	file	\N	16249	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4f1a78a0-8cdc-4bf3-b6ed-a58026954910	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/Latin America.odt	Latin America.odt	file	\N	12095	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
884aa1f1-1bee-4f18-939c-5a1ba0e29ec1	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/Wild wild everything.odt	Wild wild everything.odt	file	\N	19182	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
572aca2c-368b-4ea8-b797-75b1944c7645	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/Spain Here I come.odt	Spain Here I come.odt	file	\N	27132	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
379e0850-b25d-40b7-b504-d83c928a14fd	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/What next.odt	What next.odt	file	\N	38890	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
17df6130-ec30-4087-83a9-75e53cbd17e9	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/Life goes on.odt	Life goes on.odt	file	\N	27475	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
70016161-d186-4eb7-868e-748a7f16488c	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/India.odt	India.odt	file	\N	42868	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
612902a1-af11-4afa-aa45-15ee8219ab70	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/One, two, three - we go swimming.odt	One, two, three - we go swimming.odt	file	\N	23080	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
c7140d46-1ba8-4904-b102-d77a48afc212	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/Preparing for India.odt	Preparing for India.odt	file	\N	30238	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
695abed4-05dc-41c4-ae94-62873acd09d9	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/Rush for life.odt	Rush for life.odt	file	\N	13101	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cddc1fab-b2c3-4f5d-a254-5335ef3ae4b9	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/some years of life.odt	some years of life.odt	file	\N	19379	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7d94c446-b951-426b-986a-ece6c0200309	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/South East Asia.odt	South East Asia.odt	file	\N	38189	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ff7026e7-7618-4301-91c7-9b7003a26f0f	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/Apocalypse now.odt	Apocalypse now.odt	file	\N	21689	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
9f1db6df-68a3-4e87-b098-9a0b413721ad	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/India again.odt	India again.odt	file	\N	20066	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d4f1d396-18bf-4b13-b701-ab9bf8d41d68	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/Veronika decides to live.odt	Veronika decides to live.odt	file	\N	36409	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ee175ab6-5456-48b6-bd43-0eabf2b4b7d7	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/Locked-in freedom.odt	Locked-in freedom.odt	file	\N	10067	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
00751ae4-d104-46cf-907b-050314698a1e	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/Iceland.odt	Iceland.odt	file	\N	24371	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4aedb748-50b7-44d7-a9f4-815e6a2b25e2	46577979-a698-4498-a62a-3de3bc327635	Veronika decides to live/Novel/chapters/Now it is the time.odt	Now it is the time.odt	file	\N	27397	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
1db02b09-d87b-4612-8d98-aae568a4b0d5	46577979-a698-4498-a62a-3de3bc327635	Archive	Archive	folder	\N	\N	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
2da972f1-09ce-4e42-a82d-65d97c3b5d15	46577979-a698-4498-a62a-3de3bc327635	Archive/some history of Slovenia.md	some history of Slovenia.md	file	\N	2468	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d83743e5-8282-4008-9025-3ee42b7b5027	46577979-a698-4498-a62a-3de3bc327635	Archive/untitled-20260109-121048.md	untitled-20260109-121048.md	file	\N	208	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
cc81eec1-c275-43f4-a26f-dbd8dcc11f0d	46577979-a698-4498-a62a-3de3bc327635	.crowdly/README.md.seq	README.md.seq	file	\N	1	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
764d347c-c759-4cc7-bd0b-74d434df40aa	46577979-a698-4498-a62a-3de3bc327635	.crowdly/README.md.updates.jsonl	README.md.updates.jsonl	file	\N	37047	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4b9c9e6f-48fd-4330-9751-9e25de539dde	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260106-165727.md.seq	untitled-20260106-165727.md.seq	file	\N	1	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
7a2ce572-7c37-459e-85c9-d8a36e8d6ffe	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260106-165727.md.updates.jsonl	untitled-20260106-165727.md.updates.jsonl	file	\N	3243	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
254f3286-56b2-4499-9f86-34a4ff9d6a0d	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260109-121048.md.seq	untitled-20260109-121048.md.seq	file	\N	1	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
e21aa965-44b8-4ef8-a2c8-66e91cdeaf5b	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260109-121048.md.updates.jsonl	untitled-20260109-121048.md.updates.jsonl	file	\N	11641	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
ed2e5d46-c093-46ee-9170-9d0cd3f4b397	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260109-133201.md.seq	untitled-20260109-133201.md.seq	file	\N	1	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
4766e16a-c52c-4e45-9160-c47e803606e6	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260109-133201.md.updates.jsonl	untitled-20260109-133201.md.updates.jsonl	file	\N	4547	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
778f7cbd-1809-434b-91c8-8dea878b83de	46577979-a698-4498-a62a-3de3bc327635	.crowdly/master-20260110-123536.master.seq	master-20260110-123536.master.seq	file	\N	2	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
5174e66a-baa1-44cb-98c2-0b6ac6aa057e	46577979-a698-4498-a62a-3de3bc327635	.crowdly/master-20260110-123536.master.updates.jsonl	master-20260110-123536.master.updates.jsonl	file	\N	10551	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f7bd720d-8587-4fd8-86ad-a4e09c7ec26a	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260110-123854.md.seq	untitled-20260110-123854.md.seq	file	\N	1	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
808a342b-2ec6-4a54-a2ee-6cf6983d0061	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260110-123854.md.updates.jsonl	untitled-20260110-123854.md.updates.jsonl	file	\N	4815	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
6ee276fe-783e-4cd1-8cb9-24e0eb5b6180	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260110-125848.md.seq	untitled-20260110-125848.md.seq	file	\N	2	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f38f3368-eef5-4f86-a07b-6f4901a4a0d8	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260110-125848.md.updates.jsonl	untitled-20260110-125848.md.updates.jsonl	file	\N	15139	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d04e49d0-2220-4a8b-8693-cace3740baab	46577979-a698-4498-a62a-3de3bc327635	.crowdly/brainstorming.md.seq	brainstorming.md.seq	file	\N	2	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
06056e37-7fa0-46d9-9e8c-77d9f8fa34a9	46577979-a698-4498-a62a-3de3bc327635	.crowdly/brainstorming.md.updates.jsonl	brainstorming.md.updates.jsonl	file	\N	3408851	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
d0de5a26-352f-4f64-a120-62235ceae535	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260111-203514.md.seq	untitled-20260111-203514.md.seq	file	\N	3	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
a614166e-06ae-4334-839e-8d79ff7ea29f	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260111-203514.md.updates.jsonl	untitled-20260111-203514.md.updates.jsonl	file	\N	237564335	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
3aca8dd3-914b-466e-b6ee-0c8de3fb6c08	46577979-a698-4498-a62a-3de3bc327635	.crowdly/timeline.md.seq	timeline.md.seq	file	\N	2	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
bcbc3175-e26d-4957-b906-90830afb885a	46577979-a698-4498-a62a-3de3bc327635	.crowdly/timeline.md.updates.jsonl	timeline.md.updates.jsonl	file	\N	311273	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
92ce1842-8982-43eb-846a-19d4ff005854	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260112-010619.md.seq	untitled-20260112-010619.md.seq	file	\N	1	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
f966385c-af8d-4c53-b73e-62d949191f27	46577979-a698-4498-a62a-3de3bc327635	.crowdly/untitled-20260112-010619.md.updates.jsonl	untitled-20260112-010619.md.updates.jsonl	file	\N	9386	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
8d671be3-5a5a-4e49-bbae-b3e2129af9ef	46577979-a698-4498-a62a-3de3bc327635	.crowdly/characters.md.seq	characters.md.seq	file	\N	1	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
328a39d5-0f37-46a2-9b3b-367c5dc21813	46577979-a698-4498-a62a-3de3bc327635	.crowdly/characters.md.updates.jsonl	characters.md.updates.jsonl	file	\N	110363	\N	private	f	f	2026-01-12 17:25:04.880554+01	2026-01-12 17:25:04.880554+01	aef37573-600e-4442-9ae1-63a05799d9a0
bb9b3d8c-662c-4b74-8163-abe0b5bed888	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/refs/tags	tags	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
25cdd85f-f58f-43aa-b69c-cab86c490833	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/refs/remotes	remotes	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ac70c130-c679-4f02-8cc8-7ca7eabff5d2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	About.md	About.md	file	\N	97	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a597180f-8af3-4cc8-837e-8ab23d8a97f7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	tech notes.md	tech notes.md	file	\N	226	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
04b59451-6c60-4537-8efe-1249794768e3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	README.md	README.md	file	\N	2660	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
34f86551-18c1-4b61-a20d-155ae64cd9da	0998becc-cd14-4d39-b8c1-ae77fb9567b8	LICENSE.md	LICENSE.md	file	\N	6	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
91086836-078c-488f-9fc3-2fb28aaba03e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	brainstorming for all books.md	brainstorming for all books.md	file	\N	6120	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0678679c-106c-4cfa-9f9c-9afa91cd5551	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Happy Beings - Comprehensive Context Document latest 10 January 2026 19-54.pdf	Happy Beings - Comprehensive Context Document latest 10 January 2026 19-54.pdf	file	\N	432961	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0b0f82ba-0286-427e-9bf7-d5ed54eb5c43	0998becc-cd14-4d39-b8c1-ae77fb9567b8	happy_beings_context_latest_10_January_2026_20-15.md	happy_beings_context_latest_10_January_2026_20-15.md	file	\N	38639	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b68832ea-c83c-4270-997d-925abdbde834	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons	Book I Episode IV - New horizons	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
57cbd80f-7b0d-41e3-b3f3-b64e584d69aa	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/About.md	About.md	file	\N	111	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
7cd1b55a-6c4b-4f70-b6dd-1c1125700f5e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/brainstorming.md	brainstorming.md	file	\N	2163	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b06f4e29-e57a-4314-b86f-26b22e517f66	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English	English	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8fcff48d-1ae2-482c-8cc4-a964e41b7269	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/Book I Episode IV - New horizons.md	Book I Episode IV - New horizons.md	file	\N	16735	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ad8b86e2-a2a5-4486-b828-b51a3063e3ad	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/.crowdly	.crowdly	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
14fae417-407e-4d6f-9bb0-1c11e3194350	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/.crowdly/Book I Episode IV - New horizons.md.seq	Book I Episode IV - New horizons.md.seq	file	\N	2	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8d3741db-825b-4bae-8c34-0f03c4f0eaa0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/.crowdly/Book I Episode IV - New horizons.md.updates.jsonl	Book I Episode IV - New horizons.md.updates.jsonl	file	\N	2972305	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d31c541a-b311-4ba8-9c94-27498846dcca	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/.crowdly/table of contents.md.seq	table of contents.md.seq	file	\N	1	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5a354880-2c12-4dc0-b6ba-ab433d610387	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/.crowdly/table of contents.md.updates.jsonl	table of contents.md.updates.jsonl	file	\N	3097	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d2787e90-1ffb-40ad-9a17-2b11719a12be	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel	novel	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
93e3e848-6eb5-4472-aedf-1ccd6b0cdfdc	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/table of contents.md	table of contents.md	file	\N	190	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d8348a66-09e7-4a66-9687-743abdabecb6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/Book I Episode IV - New horizons.master	Book I Episode IV - New horizons.master	file	\N	16822	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3a73fd4c-f964-41b6-bc09-e33b156c0144	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/title.md	title.md	file	\N	32	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ec060c06-8e49-4a31-8b52-99194836095d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters	chapters	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f18242b1-604f-448c-899b-89e447efc044	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters/Enjoying being.md	Enjoying being.md	file	\N	918	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
76418a33-6963-4a91-a393-adc3441cd7b8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters/Time to go back home.md	Time to go back home.md	file	\N	73	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b8ad4a4b-14b8-4dde-b7f4-5024597673f0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters/Life of conscious choice(s).md	Life of conscious choice(s).md	file	\N	3329	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3baf85c5-17ca-43b9-9fbf-016395e54e45	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters/Beautiful new world.md	Beautiful new world.md	file	\N	4806	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
dcca217d-b967-4e4b-a837-ef21b2cfb8df	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters/Vast vast space.md	Vast vast space.md	file	\N	1214	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
90ef2f51-59f2-4001-8262-a075553426da	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters/Time to say Goodbye.md	Time to say Goodbye.md	file	\N	404	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
fda17db9-0d78-4f15-9a4c-e5395935f1fb	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters/New horizons.md	New horizons.md	file	\N	356	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b43e5f40-0068-412e-89b7-e0fee5adb6c4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters/Let's go home.md	Let's go home.md	file	\N	33	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ef7413c6-0ddf-4b72-b09c-392e2c76b436	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters/Introduction.md	Introduction.md	file	\N	1263	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ed4c046b-720b-49bd-bba1-c802adbc2e25	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters/Everything new for Quirong.md	Everything new for Quirong.md	file	\N	698	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a429ea0f-cdb6-4c3a-a5a2-7e8e940a494c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/novel/chapters/Back to Earth.md	Back to Earth.md	file	\N	223	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
7c2b393c-a873-4d6b-8715-f5b724c9119e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay	screenplay	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c98a70a2-2842-4900-ae6b-0fc57ed330ed	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/table of contents.md	table of contents.md	file	\N	190	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b2f22a7b-396f-4f31-b80b-bb414de5d09e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/Book I Episode IV - New horizons.master	Book I Episode IV - New horizons.master	file	\N	16822	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8f1a817e-b3fb-432e-b8bc-c6a99cb77e33	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/title.md	title.md	file	\N	32	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f64f1586-54be-49e9-866b-a0e1da1e7992	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters	chapters	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d745b712-7f32-4545-a6f2-4c3436df4ed7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters/Enjoying being.md	Enjoying being.md	file	\N	918	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
419ecc5a-49ba-4e48-a23c-46725de533e4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters/Time to go back home.md	Time to go back home.md	file	\N	73	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1b58b445-574d-4b31-93c9-6e7f6774d5e8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters/Life of conscious choice(s).md	Life of conscious choice(s).md	file	\N	3329	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4f9b98eb-0b02-40f5-bda0-9d24865b01c2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters/Beautiful new world.md	Beautiful new world.md	file	\N	4806	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
75683e20-023b-426d-bb88-a7c2ef369433	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters/Vast vast space.md	Vast vast space.md	file	\N	1214	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b0871a23-607a-434b-9da7-d6cf4aacd7e2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters/Time to say Goodbye.md	Time to say Goodbye.md	file	\N	404	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4feb22dc-2f76-428e-83cd-94eeb99d13f6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters/New horizons.md	New horizons.md	file	\N	356	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b0dede99-4bd6-4a4d-84f0-47adcdd6c479	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters/Let's go home.md	Let's go home.md	file	\N	33	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
20f06f9f-7da4-43b1-9c82-43e249719c22	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters/Introduction.md	Introduction.md	file	\N	1263	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
377ea1f0-4d6a-4e60-ac9f-e5083e8145fa	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters/Everything new for Quirong.md	Everything new for Quirong.md	file	\N	698	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f09bdfaa-e42e-48e9-bcf0-19a60766a48c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/English/screenplay/chapters/Back to Earth.md	Back to Earth.md	file	\N	223	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9a22c363-7891-451c-afc8-d5567f7c3c1c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos	Photos	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
23670171-238f-4711-95dd-da68025dd877	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters	Earth characters	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
38a65c16-21c5-4494-938f-2fe3b118dd29	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/akhlam olga.jpg	akhlam olga.jpg	file	\N	506084	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f52e2be8-f088-46b9-94ee-86d3e7083332	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/chen wolfgang.jpg	chen wolfgang.jpg	file	\N	16711	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
89bf175e-9c33-4ee0-b893-2ad89cafeaaa	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/nick amalia.jpg	nick amalia.jpg	file	\N	143378	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1f89d2c4-e98b-4956-9c30-da7044a303cc	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's nephew	Chen's nephew	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
71ff352d-46a8-4c85-b50f-4721277547e5	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's nephew/il'ya.jpg	il'ya.jpg	file	\N	44525	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
46e3a3c9-b4b8-479e-899b-d58f95b3793e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's nieces	Chen's nieces	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3ac1dfa3-579b-4ba6-a7f0-a49005560068	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's nieces/2020-10-inbrief_tcm7-279188.jpg	2020-10-inbrief_tcm7-279188.jpg	file	\N	102730	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cb7a1287-b2a5-4e61-a8be-a53c736678a3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's nieces/20200705161636_-691400083_6706010275363904048_480_306_80_webp.jpg	20200705161636_-691400083_6706010275363904048_480_306_80_webp.jpg	file	\N	16791	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8f3fa545-d9bd-40df-bb4d-ddf414c90ec7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's nieces/84dce540cbf84720c4a88aa70f6fc989.jpg	84dce540cbf84720c4a88aa70f6fc989.jpg	file	\N	166647	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f51754d2-1408-489f-8d35-b53dbc9c96b3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's nieces/cute-black-girl-reading.jpg	cute-black-girl-reading.jpg	file	\N	927334	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
33796904-8984-45dd-9fcd-ffde09be3dc1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's nieces/tumblr_o2mu9rmzYh1qmsv6to1_500.jpg	tumblr_o2mu9rmzYh1qmsv6to1_500.jpg	file	\N	53766	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
03d42a66-5c1e-44c2-894d-94d789a69d3b	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Peijin Jon	Peijin Jon	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c0d07a47-6c1e-4372-acf1-60d614914359	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Peijin Jon/peijin jon.jpg	peijin jon.jpg	file	\N	353449	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9d09d251-35b4-4aa0-8426-9c5b6f9eca4e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Peijin Jon/peijin jon 2.jpg	peijin jon 2.jpg	file	\N	27825	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6c64a2ca-2e66-4664-bf9f-99567baa760b	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Peijin Jon/tumblr_oacnkkX3XH1rsuvluo1_500.jpg	tumblr_oacnkkX3XH1rsuvluo1_500.jpg	file	\N	26798	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3dd09dae-e2a8-48d6-9d31-0a32c9abfc9b	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's sisters	Chen's sisters	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d420c4b9-e0af-47a9-ad3b-f779feb756fb	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's sisters/371f25870570e4877cd54880ba1d549a.jpg	371f25870570e4877cd54880ba1d549a.jpg	file	\N	62905	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b2bfd889-75f8-4245-a2a5-b51602fe87d1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's sisters/aa3a61f2f281857a38b362b435a4f64f.jpg	aa3a61f2f281857a38b362b435a4f64f.jpg	file	\N	60703	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9f45eca1-d6fa-4f99-bdd4-e9f6857f471a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/Earth characters/Chen's sisters/tumblr_oa5za0OIgV1qafozxo1_500.jpg	tumblr_oa5za0OIgV1qafozxo1_500.jpg	file	\N	36730	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4b9db7e7-a8bf-41f8-a10b-a9bc8a17ceb0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters	XYZ characters	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
14a0c520-7dad-464b-83cd-b343deea6ee2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/a ram.jpg	a ram.jpg	file	\N	218852	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3164a0f6-e128-4260-a78e-fb10b58cc5ad	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/old-man XYZ.jpg	old-man XYZ.jpg	file	\N	5621639	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
95a54807-0e31-4f1c-bc00-b831d189b1fa	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/sai ya.jpg	sai ya.jpg	file	\N	391042	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
7910655c-117c-4ef4-afb5-2fe2b1dc84b5	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/ya sha and kho pa.jpg	ya sha and kho pa.jpg	file	\N	659998	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a1402a6b-0521-4cef-b976-87505798e165	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/ya sha.jpg	ya sha.jpg	file	\N	475141	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
050bf7bd-9609-49f9-a7ae-8fa0a5553f02	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/12	12	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8174e0f7-e68d-43e4-a1b1-58811cfe688d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/col an.jpg	col an.jpg	file	\N	55394	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cb5142df-f799-43e4-8071-2e35137f2a01	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/сhild2 XYZ.png	сhild2 XYZ.png	file	\N	2542942	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
82e14247-c04c-4c72-b7aa-0afa533ca33b	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/1767524859896.jpg	1767524859896.jpg	file	\N	1928223	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5097ba0e-bea1-49a9-9ade-2efa015eea24	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/1767525921575.jpg	1767525921575.jpg	file	\N	1970166	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a25e97d5-f833-4fa2-b734-d4e86f39b738	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/1767525026481.jpg	1767525026481.jpg	file	\N	2003635	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
19734ad1-f1ee-4256-b686-a2e3d4d7a96e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/1767525497084.jpg	1767525497084.jpg	file	\N	1935960	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e87f0a78-cb1f-4aee-98e7-d63563781c16	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var	An Var	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
fbea26a3-e732-4831-940a-c9849c304d2d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/an var.jpg	an var.jpg	file	\N	928648	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e7489192-1ac8-44a7-b77e-50c15356ab68	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/an var older.jpg	an var older.jpg	file	\N	98772	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
680d27c1-a1b0-4b79-b6a3-a2ea5a9004b0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/Joan Severance11.jpg	Joan Severance11.jpg	file	\N	98479	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ec76c8ba-bd88-41fa-96b5-5e200bef7e2a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/Joan Severance8.jpg	Joan Severance8.jpg	file	\N	272702	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4972315a-16df-4ffa-a4f3-c1df3839604c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/Joan Severance15.jpg	Joan Severance15.jpg	file	\N	209373	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f42a650a-cac3-4a8d-bc93-d5cb0b2d24d2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/Joan Severance10.jpg	Joan Severance10.jpg	file	\N	65896	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
188f465b-b71e-428b-b0ad-e78332f351e7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/Joan Severance6.jpg	Joan Severance6.jpg	file	\N	87031	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2f8ef7f7-32bb-440e-ac52-f346db913713	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/Joan Severance3.jpg	Joan Severance3.jpg	file	\N	169647	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
7ee60e6d-8b7a-4811-be53-5402237e34c2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/Joan Severance4.jpg	Joan Severance4.jpg	file	\N	153361	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
492f41a6-5f34-42a4-9a92-39fa92c141da	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/Joan Severance7.jpg	Joan Severance7.jpg	file	\N	74696	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a3f939f9-454c-4514-a7d2-2f05e2f4f375	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/an var adult.jpg	an var adult.jpg	file	\N	98479	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5198437c-8677-4dda-ab6c-daece8d50b41	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/Photos/XYZ characters/An Var/an var aged.jpg	an var aged.jpg	file	\N	180295	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e518ba43-6ab1-4a59-9759-82cbbb3313a2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/.crowdly	.crowdly	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ca8fc916-0830-4a68-a3f0-d59e2e03730a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/.crowdly/brainstorming.md.seq	brainstorming.md.seq	file	\N	1	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3ec5ea6f-7154-4708-b503-2c987290bcf2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book I Episode IV - New horizons/.crowdly/brainstorming.md.updates.jsonl	brainstorming.md.updates.jsonl	file	\N	82595	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
75710d50-3a47-409a-aef0-afef2a10beb7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy	Book II Episode III - Becoming happy	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
fad4fada-1508-49a5-959e-2b54cfd8ca9a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/About.md	About.md	file	\N	200	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9a3ad540-ae9b-44c8-9642-e9cad7d07fb7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/brainstorming.md	brainstorming.md	file	\N	461	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b1a1c664-29b1-47b6-b882-eb77a6207152	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English	English	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
15f60aef-9dc9-4067-9abd-9d0f950e56ce	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/AI.md	AI.md	file	\N	4	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3100d5a2-de4d-4555-b3c4-1873a1eb1704	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Acceptance.md	Acceptance.md	file	\N	780	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
86a3f539-b00b-4a3d-b31a-9d67f2758de4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Communication.md	Communication.md	file	\N	35	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
142901e8-7622-4696-bad0-a9b57b0f9442	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Conscious anarchy.md	Conscious anarchy.md	file	\N	21	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
75df7597-f510-43ae-b282-414c97b916fb	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Conscious living.md	Conscious living.md	file	\N	337	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a28c2548-d744-49d2-81c5-834cf970b067	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Culture.md	Culture.md	file	\N	396	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9012244a-9d79-4715-88f0-5538e155ebe7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Cyborgs.md	Cyborgs.md	file	\N	10	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d31407cf-fd3d-435f-acb3-3bb2f471e28e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Distribution.md	Distribution.md	file	\N	15	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
92ec771f-b50c-4d59-874f-cebeebb3c049	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Freely accessible universal knowledge hubs.md	Freely accessible universal knowledge hubs.md	file	\N	221	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
7d282fad-5e7b-4206-9cf6-14c0d278f264	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Holographic 3D (tele)presence.md	Holographic 3D (tele)presence.md	file	\N	106	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f9aa74db-1470-4468-9296-bc783d97b32c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Houses of meetings.md	Houses of meetings.md	file	\N	261	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b82896c6-e87c-4a82-b7b1-549ce1e4b27e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Housing.md	Housing.md	file	\N	12	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
742c67a8-7679-4d03-80cd-e76b13e9b5c6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Interpersonal communication.md	Interpersonal communication.md	file	\N	32	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8709b11f-9453-48b8-be80-69e96a8016ee	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Living.md	Living.md	file	\N	181	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b44426b5-66a0-40d2-b2a8-ee3481b2e2f4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Needs based economy.md	Needs based economy.md	file	\N	22	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6f48ffb8-15a7-4a18-80e8-348d086a9eed	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Nomads.md	Nomads.md	file	\N	90	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
41bc8cbe-f5a1-42fa-9150-a5d9369b9536	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Religion.md	Religion.md	file	\N	100	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b7d60ee1-6e4b-4de3-b92e-de0650b5286e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Robots.md	Robots.md	file	\N	9	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
170505d0-ba3f-4faa-8145-849a617f87ac	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Schools (of happiness and happy life).md	Schools (of happiness and happy life).md	file	\N	149	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a7cac3eb-84fa-46a9-a90e-10913b670a09	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Sex & sexuality.md	Sex & sexuality.md	file	\N	1557	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
226cae3a-8241-4a6b-a87a-259b2e3c800c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Technologies.md	Technologies.md	file	\N	24	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c9876b66-4f4c-4351-b2fa-d50312f07565	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Transportation.md	Transportation.md	file	\N	267	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
7dac6d61-6a2f-45d9-9282-f0ac9227b73f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Travelling.md	Travelling.md	file	\N	129	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
87d9565e-0b66-4887-bd51-c891ee9b349f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Two civilisations on Earth.md	Two civilisations on Earth.md	file	\N	547	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c93d2560-786e-4c02-a723-eb4c541b4a3d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Universal unconditional life standard.md	Universal unconditional life standard.md	file	\N	159	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
26d5f04e-412b-4e8c-981c-bde0fff8ff43	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Houses of knowledge.md	Houses of knowledge.md	file	\N	140	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
28837e5d-b681-4dad-a8b2-70163abfcdf1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Free prosperous open source structures and places for living.md	Free prosperous open source structures and places for living.md	file	\N	64	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
bc3126c9-41b9-43fb-b818-62ed4339940b	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/AI product creation and manufacturing helpers.md	AI product creation and manufacturing helpers.md	file	\N	149	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
05349445-3cb2-4fc7-80f8-bbc41874cb46	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Manufacturing on demand.md	Manufacturing on demand.md	file	\N	254	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
97aab8bf-c6aa-41d4-91db-2dc004d917ca	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Urban technocratic civilisation.md	Urban technocratic civilisation.md	file	\N	96	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d54ded51-197a-41b2-8c98-226f4f818d53	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Natural spiritual civilisation.md	Natural spiritual civilisation.md	file	\N	67	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5dc46e44-bbce-45a9-b009-353cd9b43548	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Interspecies communication.md	Interspecies communication.md	file	\N	88	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0a6ce3f3-58db-4190-9b75-21d973662ee6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Economy.md	Economy.md	file	\N	44	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
68e7ed46-c5a5-4cd9-8050-d841ffe58351	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Index of contents.md	Index of contents.md	file	\N	725	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d314384d-31fd-4ea8-96fc-16826fee1c26	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Book II Episode III - Becoming happy.md	Book II Episode III - Becoming happy.md	file	\N	881	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
68be0063-cb5b-4e20-8958-51d6f3a87d95	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Becoming happy.md	Becoming happy.md	file	\N	4525	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3fb9f80f-d05f-4e03-9965-605c61a9aea0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/On being naked.md	On being naked.md	file	\N	569	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
fec8f204-3883-41a1-90ac-f388ae5d0d2c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book II Episode III - Becoming happy/English/Food and beverage.md	Food and beverage.md	file	\N	432	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
38f59935-861f-4562-8f1f-c90d4072851c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book III Episode V - New civilization	Book III Episode V - New civilization	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d7c3dc75-1074-470e-81a3-8a33cbfb19a7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book III Episode V - New civilization/About.md	About.md	file	\N	93	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0ad93f90-1dc4-46d2-907c-3d3211672d3a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ac	ac	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e6002996-2e4c-4a7b-8d52-68ded26cdde4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book III Episode V - New civilization/brainstorming.md	brainstorming.md	file	\N	2	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2b6331ec-30ef-446d-8a66-f0a4bf2b802d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book III Episode V - New civilization/English	English	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
428fe528-dc78-4121-af69-db0a5d9ccfa5	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book III Episode V - New civilization/English/Book III Episode V - New civilization.md	Book III Episode V - New civilization.md	file	\N	130	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c289b743-1861-4043-8616-80f3c81de8d7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book III Episode V - New civilization/English/Index of contents.md	Index of contents.md	file	\N	21	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
56d5da9e-cce6-4b3a-a0e2-b8e139d2f1f6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book III Episode V - New civilization/English/New civilisation.md	New civilisation.md	file	\N	171	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
15360124-fde4-4ddc-953f-9431d5065c1e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book III Episode V - New civilization/English/New life on Mars.md	New life on Mars.md	file	\N	623	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d6866be4-e350-47bb-a823-21d876ea46d4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book IV Episode I - Moving to Earth	Book IV Episode I - Moving to Earth	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
545ba36c-2f5c-4dcb-96d9-0180cf4a95c2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book IV Episode I - Moving to Earth/About.md	About.md	file	\N	125	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a8748c23-888a-42b8-be58-560ed19a13d3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book IV Episode I - Moving to Earth/brainstorming.md	brainstorming.md	file	\N	55	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
42cf8710-cd84-4bd3-8063-80bd25d2998d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book IV Episode I - Moving to Earth/English	English	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
45bc1d64-4692-4aaa-934f-c05587aacbc7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book IV Episode I - Moving to Earth/English/Moving to Earth.md	Moving to Earth.md	file	\N	495	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
7c669de5-bda0-4782-b2f9-734f3bd55b12	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book IV Episode I - Moving to Earth/English/Book IV Episode I - Moving to Earth.md	Book IV Episode I - Moving to Earth.md	file	\N	125	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b10614dd-c669-4adf-b3c8-65de95c59dde	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book IV Episode I - Moving to Earth/English/Index of contents.md	Index of contents.md	file	\N	41	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2b3c0365-22cd-4146-9f7d-c01be9e7d7bb	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children	Book V Episode II - Walk of children	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cfd5fd16-e443-419b-ab74-deac1ec32cf3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/About.md	About.md	file	\N	130	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d07343ca-b412-470f-aed2-9bbc3d20e8eb	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/brainstorming.md	brainstorming.md	file	\N	673	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
44cfd9f9-92f9-45ac-9dcc-7cbe8c6d20b9	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/English	English	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
136244bc-ade6-4464-b90d-265ee804a9f6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/English/Autonomous people.md	Autonomous people.md	file	\N	485	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6b5db63a-ce0f-456b-9e9b-b461751c2a28	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/English/Be the change you want to see in the world.md	Be the change you want to see in the world.md	file	\N	347	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3efc74c9-3955-4fb4-9ea7-9f8f57744943	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/English/Crisis as an opportunity.md	Crisis as an opportunity.md	file	\N	187	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9f053f3d-126a-4508-96a2-2fb44539d2e3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/English/Dominance of money.md	Dominance of money.md	file	\N	278	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4d398a0c-4b8f-4192-b4c8-c8312f447ab8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/English/First free and prosperous open source structures for living.md	First free and prosperous open source structures for living.md	file	\N	325	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d5ffa8df-0542-4d5f-84e2-52e8dc9a9057	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/English/Slaves forever?.md	Slaves forever?.md	file	\N	18	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ce54163d-1b86-407e-ac25-1e1dd47cb826	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/English/Walk of children.md	Walk of children.md	file	\N	593	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ce9a901a-6310-4af6-a513-e1e07b66fc36	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/English/Walk(s) of peace and love into peace and love.md	Walk(s) of peace and love into peace and love.md	file	\N	179	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
fa88b4a5-3b81-4d4d-b80e-fbfb3e874f7f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/English/Index of contents.md	Index of contents.md	file	\N	276	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c9a2d8cb-d10f-49cb-9321-9b25adb9f781	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book V Episode II - Walk of children/English/Book V Episode II - Walk of children.md	Book V Episode II - Walk of children.md	file	\N	419	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b69e34be-6dc4-4ff8-93e7-f1bd71188630	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VI Episode Zero - Civilisations starters	Book VI Episode Zero - Civilisations starters	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d955126b-69b2-4410-90cf-c23f4137fc3b	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VI Episode Zero - Civilisations starters/About.md	About.md	file	\N	207	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
759cc2d3-4e1c-4ef2-bead-776e29c62f67	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VI Episode Zero - Civilisations starters/brainstorming.md	brainstorming.md	file	\N	1320	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
53739f4f-60f1-4255-8562-5a4099d4a59f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VI Episode Zero - Civilisations starters/English	English	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8f7d7003-b819-4b1b-8302-c8fad1f053cd	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VI Episode Zero - Civilisations starters/English/Civilisations starters.md	Civilisations starters.md	file	\N	26	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8f2a2f59-7383-44db-ad96-cc0ade3ae9d0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VI Episode Zero - Civilisations starters/English/Index of contents.md	Index of contents.md	file	\N	27	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d30be832-e17a-4d8f-aa4a-2cc5e459f5c5	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VI Episode Zero - Civilisations starters/English/Book VI Episode Zero - Civilisations starters.md	Book VI Episode Zero - Civilisations starters.md	file	\N	128	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cc54ff6b-6f3e-464a-bb35-a178731120a2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VII Episode VI - What goes around comes around	Book VII Episode VI - What goes around comes around	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5d2d4984-1b31-4bac-9c0f-b3416d7701e1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VII Episode VI - What goes around comes around/About.md	About.md	file	\N	380	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6c6dcdc8-b29c-4bbe-85a4-76c0647186d3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VII Episode VI - What goes around comes around/brainstorming.md	brainstorming.md	file	\N	555	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c70030ef-efb9-4d7c-a48a-4e2435fa6cdf	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VII Episode VI - What goes around comes around/English	English	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d3503863-22f9-4748-9f81-35089f8e3cd7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VII Episode VI - What goes around comes around/English/(It's) Time to go home.md	(It's) Time to go home.md	file	\N	286	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b923ab48-bff5-4e00-b1ca-06f9e82eac05	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VII Episode VI - What goes around comes around/English/Where is the white cube.md	Where is the white cube.md	file	\N	27	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0c09b46b-cc8e-42ae-975e-ac0d81cd561d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VII Episode VI - What goes around comes around/English/Index of contents.md	Index of contents.md	file	\N	55	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cfb83a19-51e0-43ac-9413-9743b0df73b3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	Book VII Episode VI - What goes around comes around/English/Book VII Episode VI - What goes around comes around.md	Book VII Episode VI - What goes around comes around.md	file	\N	106	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cf82f92f-530e-407e-ac95-1af48ebc0cfe	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git	.git	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
30862825-ca50-44cb-9e21-dc5a0544025a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/description	description	file	\N	73	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0006fc7c-07fd-4272-b295-07c8ed134d09	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/packed-refs	packed-refs	file	\N	114	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4c62b2da-5ed6-41c5-984e-0294ed6559c0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/HEAD	HEAD	file	\N	23	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d46c1a80-bfb4-4328-8560-fbf66cb1776a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/FETCH_HEAD	FETCH_HEAD	file	\N	96	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a0b81f55-487b-4c06-a471-1fe85d97daf1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/ORIG_HEAD	ORIG_HEAD	file	\N	41	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
beb37811-d876-48fd-82c9-0643b08cd8db	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/config	config	file	\N	322	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
01d0ee13-3ac7-47cf-a4f6-56106c768709	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/COMMIT_EDITMSG	COMMIT_EDITMSG	file	\N	44	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ecb04b0e-8206-462a-b8bf-3c13eefd9c03	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/index	index	file	\N	19247	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ed9eb97e-71db-4975-941c-51c2230bea64	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/branches	branches	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
23aae569-f254-4c34-93b5-1f4046dbef5a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks	hooks	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
eedfe7cf-2409-4675-bbed-ffaa99bda5ef	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/applypatch-msg.sample	applypatch-msg.sample	file	\N	478	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b8b2d498-f7e1-48d6-a670-775ae6fd8c0d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/commit-msg.sample	commit-msg.sample	file	\N	896	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
aab41b4b-5000-4782-ae8d-4603fd909667	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/fsmonitor-watchman.sample	fsmonitor-watchman.sample	file	\N	4726	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
28ae66cc-3a0a-4b61-944b-bad59ec5c428	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/post-update.sample	post-update.sample	file	\N	189	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
889329ac-9a6b-418e-b805-d5fa1298c8f0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/pre-applypatch.sample	pre-applypatch.sample	file	\N	424	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
29488d55-b3f6-4262-b79c-b75bf6f9cdf6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/pre-commit.sample	pre-commit.sample	file	\N	1643	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1371cf7c-ad3b-4687-a097-485228bbc2c8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/pre-merge-commit.sample	pre-merge-commit.sample	file	\N	416	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b9f56e0a-9b80-4d7e-827b-4cbec14ee016	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/pre-push.sample	pre-push.sample	file	\N	1374	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9871a153-fdb3-4444-9e98-a730194951e8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/pre-rebase.sample	pre-rebase.sample	file	\N	4898	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1ed034b5-b042-44ea-9dc7-d29547a68aab	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/pre-receive.sample	pre-receive.sample	file	\N	544	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cc37466c-caea-4452-a961-cbad51051b07	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/prepare-commit-msg.sample	prepare-commit-msg.sample	file	\N	1492	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a8851960-56bd-4153-9ed6-ef7c55a7d584	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/push-to-checkout.sample	push-to-checkout.sample	file	\N	2783	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e36ac956-aeb2-4972-a64f-7e12507d9560	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/sendemail-validate.sample	sendemail-validate.sample	file	\N	2308	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c639c9de-b439-4444-9bc7-83f5323427fd	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/hooks/update.sample	update.sample	file	\N	3650	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
035c517d-350e-4016-bec7-81b40f298118	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/info	info	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b1b97806-7486-418c-92eb-bc00b946b22c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/info/exclude	exclude	file	\N	240	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d23755c6-af9d-4152-8232-3a315290a0a9	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/refs	refs	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
db27b65a-d9a1-43ec-9c68-fed11340fecc	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/refs/heads	heads	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cf6475da-7e75-4837-83c8-9e4c5fb71d30	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/refs/heads/master	master	file	\N	41	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e1ac15c0-8325-4cbe-b15b-582413623bf1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/refs/remotes/origin	origin	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b89951da-5972-467f-9ad5-715e18bd8368	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/refs/remotes/origin/HEAD	HEAD	file	\N	32	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3de3c9d0-5bcf-430a-acee-ee33ebab06ce	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/refs/remotes/origin/master	master	file	\N	41	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
db4d5ad6-765b-4eb7-b099-b6efddc8649c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects	objects	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a71b1d81-28a1-45dc-b219-a8b29e049bae	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/pack	pack	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
89a217c0-6bcc-495a-a520-209a7d20f436	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/pack/pack-a806eb0d9f1885bf93d0774d81592e2cf565732d.pack	pack-a806eb0d9f1885bf93d0774d81592e2cf565732d.pack	file	\N	16935222	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4b6a0a75-72a5-4fa7-8253-9218b38353f7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/pack/pack-a806eb0d9f1885bf93d0774d81592e2cf565732d.rev	pack-a806eb0d9f1885bf93d0774d81592e2cf565732d.rev	file	\N	2332	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
68b05d7b-571c-47f3-9ccb-02b2e44707e7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/pack/pack-a806eb0d9f1885bf93d0774d81592e2cf565732d.idx	pack-a806eb0d9f1885bf93d0774d81592e2cf565732d.idx	file	\N	17032	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a9a9be32-197e-4808-a3ce-64befa35be01	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/info	info	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c25f9ed3-3c8c-42b3-bac4-38bc6f3418dd	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/6b	6b	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1172522a-eb75-4fa1-8e13-58d1e6b0cc0c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/6b/156cbd883887d79ef91aefc056cff41927f9f7	156cbd883887d79ef91aefc056cff41927f9f7	file	\N	113	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8543fae2-dee3-4693-8566-c021be53231d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f3	f3	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c79bb22d-9cfd-4031-9efc-e949befc7297	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f3/0ff8c343aab5b7534f242d04f3abbd0f83651d	0ff8c343aab5b7534f242d04f3abbd0f83651d	file	\N	116	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a8b1abb7-5f8e-4d77-8cdc-3f8e71379a21	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ca	ca	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
91045e48-054e-404e-9a9a-774d3ba55ddb	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ca/fb7a397cdf03aa02efb58c63a4015f953dd087	fb7a397cdf03aa02efb58c63a4015f953dd087	file	\N	155	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
804f93cf-1cba-4465-9411-e541b7bf125a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3f	3f	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ab6763d5-fedb-4307-9b49-1ea6753e1aeb	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3f/9833a8f79f38f03df4e9d15196b1523dca77a0	9833a8f79f38f03df4e9d15196b1523dca77a0	file	\N	191	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
aa253410-2a10-4419-82c6-9ffd56354423	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3f/bdc227fb158f73f8b86378bd19e437f2e374b2	bdc227fb158f73f8b86378bd19e437f2e374b2	file	\N	124	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
54b2c11c-ee79-411f-bc00-31e196f4add9	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/40	40	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2e906fc3-0dfb-466e-8dfe-01a08a695a8f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/40/69686522ef6692b4870d24793011c013c06d2e	69686522ef6692b4870d24793011c013c06d2e	file	\N	118	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
db122a3c-1d4a-419c-a549-0cd71bf32b08	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/40/df79c3a2200fc37557807173a1c1a735367f1d	df79c3a2200fc37557807173a1c1a735367f1d	file	\N	346	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
682dba2a-ac53-4e87-8d1c-6f6befe09762	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/40/7a8ddb0d40d48013e966f4e03ad0c8174fa42e	7a8ddb0d40d48013e966f4e03ad0c8174fa42e	file	\N	238236	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cf0844f8-f6f9-4723-98bd-53490f2db523	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f9	f9	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
75cc5d41-dbcd-4ec3-bcc3-06ed0137ead7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f9/b1cebf069619c8d6612c83102a17b02d82e89c	b1cebf069619c8d6612c83102a17b02d82e89c	file	\N	87	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6a01f451-1979-458c-8ce3-0d7a136377fd	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2d	2d	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a3429f39-f0a9-4a4e-8405-226d743786cd	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2d/8a18383a4b02740463ce6a250dd2c23d325580	8a18383a4b02740463ce6a250dd2c23d325580	file	\N	87	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0444031a-71df-43e2-932f-2b6bea2549bd	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/c0	c0	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ba952668-e608-4d40-a5ec-6c9391aac945	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/c0/6b8c3a32bc2f1f6ca3368005dec38866dc0cb7	6b8c3a32bc2f1f6ca3368005dec38866dc0cb7	file	\N	87	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4b75c6df-d107-4d36-9820-80e7bfb0653e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3c	3c	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d4111df2-d0ac-4a0b-abc2-e8c379b7a4e6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3c/60c5c7a507ba3a8c2b2001828fe59376ae87db	60c5c7a507ba3a8c2b2001828fe59376ae87db	file	\N	465	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4d6ebd66-7807-4ef9-a498-9f32e752bb4b	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3c/9e5a286ff2c07388e09be709df0570904b26a5	9e5a286ff2c07388e09be709df0570904b26a5	file	\N	1900998	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
7059d272-fb2d-4c94-b6f3-c6f3a6e90ecc	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3c/c601cf9836e5bba3af23feda054afe9abd6c92	c601cf9836e5bba3af23feda054afe9abd6c92	file	\N	1951511	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
bad3d90c-6e57-45ed-81e9-9b4d288895fd	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/22	22	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
06eb1028-b5bb-4433-b383-7c1ac1c87f1a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/22/4cec0bf0ad031ef6276153b0eaf4375fb6553d	4cec0bf0ad031ef6276153b0eaf4375fb6553d	file	\N	190	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d6410725-39ee-4f8e-b377-d2c3c6e5b353	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/e1	e1	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
dd97eb97-2ba8-47ea-9424-578ec50e25c2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/e1/a975ed68b11e6a8d1d3b49bf9daa146da9eb30	a975ed68b11e6a8d1d3b49bf9daa146da9eb30	file	\N	241	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3b583acd-9eb9-4666-aa5d-2c185d749942	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/0f	0f	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f25e1c83-66cd-407a-b6db-6ea353af1b65	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/0f/742064bc02459f833ce205c2ecc9345bcef00b	742064bc02459f833ce205c2ecc9345bcef00b	file	\N	108	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d2dbae17-472a-4304-9e6d-f19172324114	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/0f/b72f6e96a941e7df00f393172f4244db2995b1	b72f6e96a941e7df00f393172f4244db2995b1	file	\N	193	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
127845f8-f4dd-4726-9b87-a066df7b6361	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/b1	b1	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
47dd76f1-7b56-4f61-b7e3-26cb015f5cdb	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/b1/91a028bb6bf699a44ac74a3912ae4f6ebccf2a	91a028bb6bf699a44ac74a3912ae4f6ebccf2a	file	\N	116	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9eded4f6-69fa-4d00-aab3-361aede73e76	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/49	49	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
064ddc2a-e865-4d67-8eda-52f9b466a9bb	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/49/a12f9f7c36172ae84fcd92c57bd76ddeee1396	a12f9f7c36172ae84fcd92c57bd76ddeee1396	file	\N	112	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f51e5d02-1e9e-430d-b4d8-269bf110fc85	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/49/7063b557bb172ccf60fa67c4008ab8dca68b47	7063b557bb172ccf60fa67c4008ab8dca68b47	file	\N	467	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
00c92709-bacb-4dad-a9f4-16f6a8a6fdd3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/81	81	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f5cfce62-ffee-4e62-a502-53fd786fdae9	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/81/6ea20fbd9b537e48bd0b9db315a4265ac03c4b	6ea20fbd9b537e48bd0b9db315a4265ac03c4b	file	\N	153	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
71db49cd-0664-4f9e-9154-d87cf886fbfc	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/aa	aa	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3e4e6523-be6b-4030-a493-e44dedbdf5d4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/aa/454d0ffc43cb4eedb76b6ed30a0ac0ebbcd27a	454d0ffc43cb4eedb76b6ed30a0ac0ebbcd27a	file	\N	110	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1f037243-e951-4ce8-8a2a-a6d67fbed98c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/92	92	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
52b437e0-5b09-4dc2-b125-795cc35867f1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/92/c94d133cc9231bc6a4f65424b37886c6cf8334	c94d133cc9231bc6a4f65424b37886c6cf8334	file	\N	72	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d5335a88-a0e3-4253-895f-a6e50f7b01f3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/7a	7a	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2f031656-ef27-431c-a6eb-c56ac09cd5c0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/7a/7c34922294f70f380014ef803778e3ff24d45a	7c34922294f70f380014ef803778e3ff24d45a	file	\N	43	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
20641c81-18ed-4ce4-8c99-ae5beb8f9b5c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/7a/128adc77a1f1475f19c8332d4165fd6490a81a	128adc77a1f1475f19c8332d4165fd6490a81a	file	\N	173016	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d4df9b33-9ce5-4bd0-a480-2bd7d30495dc	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/cb	cb	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1f4dd70a-51b9-4a6a-8d49-c3d25b12c8d5	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/cb/7a70190426d3d00635d8afe5c6eb4bff116631	7a70190426d3d00635d8afe5c6eb4bff116631	file	\N	542	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
7f9272bc-d560-438d-af9f-e2603682fcda	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/74	74	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
63bd734a-e15c-46c5-a214-971c55e4f9af	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/74/7ea388d529281a4f0b432c95c9fb99f2c88fac	7ea388d529281a4f0b432c95c9fb99f2c88fac	file	\N	156	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c97503fd-7d95-43ce-84c5-a5147effa402	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/74/05dcdc70257e57fc959e8d45b0159b61774a7a	05dcdc70257e57fc959e8d45b0159b61774a7a	file	\N	192	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8a81837e-789a-4b69-b694-34a2b48f67af	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/11	11	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4a3a4a79-d7ee-4f3d-9020-210ef41770d0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/11/00e201641088f767e72d5edc850cd2f3b9dd16	00e201641088f767e72d5edc850cd2f3b9dd16	file	\N	1394	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0c7cd04a-4b68-4d49-a4fa-3194939e80e3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/c9	c9	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
90e5759a-c386-47db-bcb6-fa5096a04e56	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/c9/eda8cd28a1060541967346793565eb2486ae18	eda8cd28a1060541967346793565eb2486ae18	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
830c1047-418a-418d-89da-e7e519a15ab8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a4	a4	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
05610a6a-aa81-4904-8e35-2be4728d7bf5	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a4/ca423f2f48f6a5a80ea6e005a01fc3cdda1c0b	ca423f2f48f6a5a80ea6e005a01fc3cdda1c0b	file	\N	156	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9b5a03ab-5478-4f73-8c58-a31189fb2970	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/84	84	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
803cff20-67fa-4c3d-a067-ad493415e04b	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/84/49ebc607b78ea018bc08aafc43c561839a9a20	49ebc607b78ea018bc08aafc43c561839a9a20	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
dd62f070-b008-4187-bfaa-589f267351ae	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/84/4ee476e394bde5a52bccf2237a4858407451fd	4ee476e394bde5a52bccf2237a4858407451fd	file	\N	405	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4e79a8c8-605a-4b0e-867c-de83316e4ec5	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/df	df	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
21a7a532-a831-4581-9ce6-ae6e90146638	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/df/42ad55689aff1332dfacd2dfbbe6901f084524	42ad55689aff1332dfacd2dfbbe6901f084524	file	\N	152	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
73f9e92a-2454-4ba9-b4df-6cd3bae9f393	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/df/633126550cdce37f1c8da4c006c65fe2b726c0	633126550cdce37f1c8da4c006c65fe2b726c0	file	\N	156	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d3cd6a37-ec0f-4231-8275-7765be9d8682	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/d9	d9	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6c6ef58d-7410-40cb-8eeb-13ebb2d2a06c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/d9/f28eaa7724134ac895927a9a865354753aaeb9	f28eaa7724134ac895927a9a865354753aaeb9	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f189e722-e83c-4592-9e25-ea57a977b076	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/d9/827a2d2aaa928010879768668fc8418950aa58	827a2d2aaa928010879768668fc8418950aa58	file	\N	125	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
032c8f3c-ce13-4e09-899a-3d246a5ce3c8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/fc	fc	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
42e371cc-88ce-4c28-b891-b0941796c9ca	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/fc/f77a896afd7e0c5c022d20e0fb609d5fe9d293	f77a896afd7e0c5c022d20e0fb609d5fe9d293	file	\N	505	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
231d249d-5666-4238-84d6-158c585eacc8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/fc/1604038ea0ce25c57e5eeaf157dcf5e3635366	1604038ea0ce25c57e5eeaf157dcf5e3635366	file	\N	502	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5016de6b-cc53-419a-873e-901cb0879014	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/fc/3666e28e70e791eef2fe35a546bd891ab89766	3666e28e70e791eef2fe35a546bd891ab89766	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d49c0852-669c-40ed-94ec-3f73f094624a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f7	f7	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8df4fc9d-4605-4e96-a85c-ece4d54da872	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f7/f60c84bfd50b19b5c4b673a4933cb514f6814c	f60c84bfd50b19b5c4b673a4933cb514f6814c	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
69c4e4f2-c439-4ac9-8dba-4fc722bb629e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/b2	b2	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
339999d1-35d6-4708-a2bc-e350f1db0f3a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/b2/abda1bf254bcdb973466f4c7d96cedbda33867	abda1bf254bcdb973466f4c7d96cedbda33867	file	\N	160	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
7518c94c-32da-4c40-94f0-77d2d82a8fcc	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/5e	5e	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
09c5d2eb-2009-4507-8267-baad3ccb6d3c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/5e/0f29776efacc63c9873f9828c4938a86205615	0f29776efacc63c9873f9828c4938a86205615	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5b4b807f-f2d1-41ff-9c12-7f3b25612251	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/dc	dc	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6d14b43c-a8b3-41f3-8123-bc8e51d53140	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/dc/f3843ad422c410eeb4d87f313b595eb8c26aba	f3843ad422c410eeb4d87f313b595eb8c26aba	file	\N	230	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
df71ebd6-1717-4154-92b1-fa1f5f94aa77	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/dc/be31a87d82e17b54b213061073d9bf0c6c4d14	be31a87d82e17b54b213061073d9bf0c6c4d14	file	\N	497	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f9298636-2db4-4a7e-8fa8-d3cfad7d4214	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/43	43	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
881f5151-8be0-4597-bf73-af03a88d328f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/43/372b582c17fc6a26762c6fe2c4b273ade2def5	372b582c17fc6a26762c6fe2c4b273ade2def5	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b6c5a030-bc7d-4532-8080-49965f61bbd8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/43/0e23d890ecf71a467196ffcfc793e2ca42d06d	0e23d890ecf71a467196ffcfc793e2ca42d06d	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e298ce52-b2a7-493e-b279-10ad44bfaf74	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2c	2c	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cab2dca0-bcee-4df6-8b36-75d377b3076a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2c/d115957c282b8678bae900b3bafca292a1280a	d115957c282b8678bae900b3bafca292a1280a	file	\N	502	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8d4df8be-5836-4c3e-be60-dd941bf58ca8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/70	70	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e791fc81-4653-4408-954e-8ae92164b380	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/70/9b1c48f412f0b715cfbd7f9df91db92bf5e62c	9b1c48f412f0b715cfbd7f9df91db92bf5e62c	file	\N	217	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a2685373-5d01-4686-b811-95cc10df2115	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/78	78	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6bff99b7-f9a5-4855-93b6-7a7c4a1319b1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/78/2fade534a11e3b78186d66b8e7af1c1cf90e56	2fade534a11e3b78186d66b8e7af1c1cf90e56	file	\N	467	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e141a89c-2e87-4617-8c5d-15551071a660	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/78/00e8f1573f6d1eb7c932d6b28e6c78144bcfd0	00e8f1573f6d1eb7c932d6b28e6c78144bcfd0	file	\N	529	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1b06faac-ced1-4629-a32b-f7e4c3f8d60a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ae	ae	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
52a19915-2fc1-44c4-a234-109fedccd8b3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ae/fdd188949cc1c2e6717814e0ff2a5215f7eef3	fdd188949cc1c2e6717814e0ff2a5215f7eef3	file	\N	199	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
04d675c2-e026-4f9f-ab4f-212aede0ce3b	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/b0	b0	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9a087798-3b57-40e6-a71c-1b82b2956f37	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/b0/a3b9e18f19486f6005d23a874717d1ad231e32	a3b9e18f19486f6005d23a874717d1ad231e32	file	\N	258	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
73758663-abff-454e-8bfb-20b245e669c4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/8b	8b	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
fbe36df4-d1f2-458b-b5a6-13f6b5009075	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/8b/a90597a0aecf7f626ef8769b71eadc8c843171	a90597a0aecf7f626ef8769b71eadc8c843171	file	\N	116	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d80a047e-623b-452d-b152-57b323dd52e5	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/28	28	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
fc58692f-71c9-42c4-9c20-09d3c42b612e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/28/81748d27a9e7de2bad8be35ce43b043f1764f9	81748d27a9e7de2bad8be35ce43b043f1764f9	file	\N	112	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a80e267d-1660-4988-bc92-9c60e046274c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/28/1d1c907b32eaa8af604bc3675cd04fb2a5c139	1d1c907b32eaa8af604bc3675cd04fb2a5c139	file	\N	467	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
7adc066e-acf4-4fcc-b342-ea2ee3e65dd3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/0d	0d	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cd7f6cd7-a443-483e-b72b-667e417c960c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/0d/bc207738e080b34d5e1367d703a8f0e4cf92d3	bc207738e080b34d5e1367d703a8f0e4cf92d3	file	\N	69	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
88cea3a2-8265-4598-874b-9c06474bb2ad	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/18	18	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5c01d187-05d4-47f7-b133-b540e6bb609e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/18/919899d041853f155a7a4a6cffe035d5af6cad	919899d041853f155a7a4a6cffe035d5af6cad	file	\N	504	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c8fe17fc-3149-4202-bc1d-3167f15c3817	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/18/b1c061ab6b193680cd81170d847254c9a48808	b1c061ab6b193680cd81170d847254c9a48808	file	\N	1411	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
238a195e-a59c-46db-9569-6a41361746ca	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/7f	7f	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
26b119ca-b0fc-469e-a203-05a25362b4ed	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/7f/2e10d2bc65b30ee9668611d2846c42f0e3d743	2e10d2bc65b30ee9668611d2846c42f0e3d743	file	\N	160	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6806ee6d-45f5-44e6-83f4-9b96ddd7c733	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/7f/f88d4d72ef8a6f011d7dbad00684a5f4ac682e	f88d4d72ef8a6f011d7dbad00684a5f4ac682e	file	\N	180	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f3b49a7d-93ff-4f73-951d-dde1a76c7829	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/24	24	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e53ceb04-eea9-4a8c-a2c0-596be6ce7d42	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/24/e1ceae86c90ad9578128512480f832f797ab25	e1ceae86c90ad9578128512480f832f797ab25	file	\N	125	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5c6c14cd-b6a0-4cf1-988c-ff6442e50799	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/48	48	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
fc239172-e76c-48ed-b116-e08554cfabb6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/48/19663039d968b9fc20b344312da100554ef9cf	19663039d968b9fc20b344312da100554ef9cf	file	\N	230	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3eadf2cf-6d07-48b7-9995-7f389c87931f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/8c	8c	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a8c152f5-6512-4f09-b0fe-8ae1d9fa9b5f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/8c/ae2aca984d17d5c81f01fef9284d1880ad3d89	ae2aca984d17d5c81f01fef9284d1880ad3d89	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4a98c9ad-0226-40ab-b14b-4e8ce268825e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/8c/1c339120caeabef6825dd4b990f68c48d3ac67	1c339120caeabef6825dd4b990f68c48d3ac67	file	\N	203	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d3effbe1-e5bf-4317-84a6-122227cc72d2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f5	f5	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
76dbecdb-1ccc-4b13-b6c3-27337ea15f15	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f5/e89955eeed48dd69c96c763ad3bc53c67c5894	e89955eeed48dd69c96c763ad3bc53c67c5894	file	\N	174	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f3b130a9-be4d-421d-b10b-b1a93e9cc29d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2a	2a	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b29d283c-287b-4b71-ad03-1acc1bb455e4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2a/45a334ff1d51f986dcab018024210904cf7cea	45a334ff1d51f986dcab018024210904cf7cea	file	\N	105	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8d4527b3-baef-441d-869b-93cd78edb3ff	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2a/dfb856d6b80e521d0a66e47ec817ff7f99a997	dfb856d6b80e521d0a66e47ec817ff7f99a997	file	\N	267	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
076d94e4-f9b1-43dd-891d-41d7d6937444	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/4f	4f	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
aed8d62c-b732-4049-b169-d6a1fbd47395	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/4f/348bd52eb97a9f8fc9b744f4580c6bf3f2e720	348bd52eb97a9f8fc9b744f4580c6bf3f2e720	file	\N	501	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
59fe601f-8559-499d-9165-7ce18d9345ec	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a8	a8	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4a23f81f-fcfb-43ca-ad49-e65a07d8b722	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a8/5c0bcb42a64ebd158f18cce1ab415618735760	5c0bcb42a64ebd158f18cce1ab415618735760	file	\N	164	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8e738a2f-3ec3-4f65-973c-ce412894117a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a8/fc869e157b6a480341d6621fe16fd9f437271c	fc869e157b6a480341d6621fe16fd9f437271c	file	\N	357	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0056b9eb-63ce-40f6-9938-a9d1889e191e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a3	a3	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b5c4bbfd-c033-407e-8a50-4b21301cfce7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a3/27f2eb61f89903b7a69a3166d4efcdf050fe2c	27f2eb61f89903b7a69a3166d4efcdf050fe2c	file	\N	175	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3d640cde-a5df-4827-8370-cf6c8bd3b274	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a3/360710d7cf73e32991c066013ca970b08c144b	360710d7cf73e32991c066013ca970b08c144b	file	\N	146	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
210daabc-f250-4516-837e-7fd4c3cfda99	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/75	75	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
69191647-7e88-4057-b501-45d0ca71fb04	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/75/b7b6e24b585cb19dd2972e58ac9dd4fae3f2c4	b7b6e24b585cb19dd2972e58ac9dd4fae3f2c4	file	\N	200	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2ed64db9-e6fc-4424-a8c5-ccf0deb51d53	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/47	47	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b9282338-0767-4c06-834c-5688e37b2050	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/47/31c746a47e4fb512cf8db972499787ce173668	31c746a47e4fb512cf8db972499787ce173668	file	\N	246	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f5175005-ee35-4d61-bb17-d39e28a03068	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/47/3f3d333cf43e2be001b4af59dc70460eafe9bb	3f3d333cf43e2be001b4af59dc70460eafe9bb	file	\N	1357	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
07013825-9750-48ba-a4cc-010f5b6f0537	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/b4	b4	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
fb7a87e4-f39d-445d-bd90-d2e1c74dace7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/b4/33a01edcbc8bdcf0a15b6c6997ef714b82b78a	33a01edcbc8bdcf0a15b6c6997ef714b82b78a	file	\N	288	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a3eab663-ea0d-4f91-9e6a-f9ced589d5e6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2b	2b	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5279a81d-73bb-4dd4-aa0f-164ea4f58b23	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2b/cf85239ee282eafba64bd6516611ff68770acf	cf85239ee282eafba64bd6516611ff68770acf	file	\N	1309	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a207ff8c-85dd-462d-8456-ce419c3fbd69	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2b/08767bbf0d1c095ba6e039aa710e6671901cb6	08767bbf0d1c095ba6e039aa710e6671901cb6	file	\N	178	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
14f4639d-f60a-42af-8912-4ec57eab2686	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2b/f8b98684800237f70010ed704b17d0cd3fd938	f8b98684800237f70010ed704b17d0cd3fd938	file	\N	36572	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1c71384b-ecbf-4bfe-892c-fc8b6f60a3f3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/68	68	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
34608fe4-f198-4689-8ed6-7e07f8826f48	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/68/fee0ec828b0721abd92cc8cab9112a95af230c	fee0ec828b0721abd92cc8cab9112a95af230c	file	\N	537	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c323d65a-ff99-4056-a102-9aebe2261d97	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/68/907b819fcbb0b813db0c8a7164b33b30461f16	907b819fcbb0b813db0c8a7164b33b30461f16	file	\N	528	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a684c4cf-0ef2-4cd9-a6a9-2d89bd636373	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/1f	1f	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
71f34698-95f2-4ecb-98f7-70124f84ad90	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/1f/ac77b561461160940f54fa67fdc15e1d1b0815	ac77b561461160940f54fa67fdc15e1d1b0815	file	\N	156	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2724e2ee-b68d-4a51-9325-0e3bdacf5749	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/12/c84bc4faa7c11d57b0e2d10e45edb8c9cc7ad1	c84bc4faa7c11d57b0e2d10e45edb8c9cc7ad1	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9450c820-8431-4eb1-aef1-9f77b2ed4d91	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/12/550fb860842f851d36cd3b3d9f64db593edf45	550fb860842f851d36cd3b3d9f64db593edf45	file	\N	286	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ef2ebe24-880e-414a-bbd9-3f3aec461eec	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/6e	6e	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5425618d-29b7-4cb2-9bb8-70224a6c6e44	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/6e/b92c9429dd5ac285068228209e5094f83a39d8	b92c9429dd5ac285068228209e5094f83a39d8	file	\N	504	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1578afc0-38d9-4019-929a-ac26683b1cf6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ee	ee	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c929b893-b72f-4d4c-a671-a7cbc3d6557a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ee/f066f0db51a3394c9b74c47be057acb9e04573	f066f0db51a3394c9b74c47be057acb9e04573	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ce22a082-3b83-485f-8752-fb2e526d0b56	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/61	61	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
bc7adbcf-b340-4a8f-bff8-fbf8e2ad2175	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/61/4ed1c4211d50f40fb68a1b6cd335dee6779045	4ed1c4211d50f40fb68a1b6cd335dee6779045	file	\N	160	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ef457d91-2363-4a02-a5ad-936200dd26f0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/37	37	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
409f6234-41e0-4192-b6e0-3fa9e89ccc85	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/37/3c5f2ded88a0d009a1d502fab9d635c9bcd80b	3c5f2ded88a0d009a1d502fab9d635c9bcd80b	file	\N	226	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
644dab79-59ce-4675-a9b7-6ab6d92f532c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/1b	1b	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9fab1982-ca35-4a93-90ab-e619b221b126	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/1b/11988b1da65b61f3a432a74b0a36f37b58a8e3	11988b1da65b61f3a432a74b0a36f37b58a8e3	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5a5d76ac-e57a-4bcc-9fb1-31db8091610a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/1b/7ee049bda5e1ade861116e44753dcd00076d34	7ee049bda5e1ade861116e44753dcd00076d34	file	\N	184	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
37fe313b-4cf2-40c7-a416-59250c10ad33	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/1a	1a	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e43b0d3a-22ee-452a-9b44-c74c2b5791f7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/1a/b64494ea92021d8352e161a5e74662e780a81c	b64494ea92021d8352e161a5e74662e780a81c	file	\N	498	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
bea4ab22-ed20-439b-93ac-c1ed6214688e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/9d	9d	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4c49562d-3481-4548-b593-98b6f9c26118	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/9d/d191af12fc2b2765722151499dfc980fde14ce	d191af12fc2b2765722151499dfc980fde14ce	file	\N	404	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
966f7c5e-7e7c-486f-8f06-a4a4048d62b6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/c7	c7	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d3ee193f-49b4-4c26-8918-1624b8b1d4d7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/c7/3121f5c1862283d755832d47caaca23af3fb61	3121f5c1862283d755832d47caaca23af3fb61	file	\N	91	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a73a7837-a581-477a-aa42-06a4435b7fd6	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/45	45	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
dac68996-0863-47a9-be8e-ee064016bc35	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/45/3c5b57217d4bf923612ba403b5160c1a33e08b	3c5b57217d4bf923612ba403b5160c1a33e08b	file	\N	187	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2e73af98-c1e2-453c-9562-2569bb47b704	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/34	34	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
97d4d9a5-a97e-44db-9d85-b8dee2dcbc25	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/34/17dea26334cfbe28fca4abe05d2e0f203108c4	17dea26334cfbe28fca4abe05d2e0f203108c4	file	\N	77	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f7d63c9b-c379-4fb8-8cb8-53746032c5f3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/5a	5a	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8098ad5f-5bb8-4a98-ac86-e4fad3c4fb52	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/5a/05c42aca02c018674bbf74bd7b6d2a5479a9a9	05c42aca02c018674bbf74bd7b6d2a5479a9a9	file	\N	91	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
82d3c6a8-5427-4e43-9d42-e50184b48767	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/5a/737ff374aaa6828ba08c470c28eb2384844598	737ff374aaa6828ba08c470c28eb2384844598	file	\N	74018	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d4045656-5aaf-447e-82c0-2f144d8182c4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/03	03	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b3ed45fd-3862-4d6d-bdf5-da166ad3766f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/03/25d38550c78030917da73ec3d0743cb3ee1611	25d38550c78030917da73ec3d0743cb3ee1611	file	\N	120	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c0e483bb-7d9b-4605-bc2c-11ae308c3139	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/be	be	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c642859d-7366-4983-983c-301ade34bde7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/be/2a631a8e58368d3e0269f5c132b1880a430273	2a631a8e58368d3e0269f5c132b1880a430273	file	\N	1051	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2a9f49d7-9966-402c-baee-3ab8614db084	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3b	3b	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8b50a47d-084b-49a4-819c-3d0e6518cfb4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3b/2baa8f1fa810e5fcd6abedec71aa17596b4458	2baa8f1fa810e5fcd6abedec71aa17596b4458	file	\N	74	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
df8f7209-dead-4c7c-a970-3292648c2b50	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2e	2e	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c21eacfd-abe2-4d92-93f1-ee6a6825606d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2e/23d3346c12d8ac362541b05485cd1f44a46513	23d3346c12d8ac362541b05485cd1f44a46513	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f112e84b-22d9-46de-bd6c-1fa1e7b1f22d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/2e/fcb8c38efe95afe71c30bc14d56443b5ce3e15	fcb8c38efe95afe71c30bc14d56443b5ce3e15	file	\N	473	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
632d8db9-9b45-4685-a419-28d451490843	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ef	ef	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d445095c-a66e-43cf-96b8-764ab3a513c5	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ef/62ffeae988222c8986b37c50332d68d7c3d3ef	62ffeae988222c8986b37c50332d68d7c3d3ef	file	\N	173	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
53a19b69-549e-4f6a-9f7a-a3ab81ded6c0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ef/1a30861c2422018fb05236264798164cd56174	1a30861c2422018fb05236264798164cd56174	file	\N	529	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a6969bf8-821c-43ed-93e4-b9fad2a38a29	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ac/adfe4a20361959b32717bef677f4632ea5023d	adfe4a20361959b32717bef677f4632ea5023d	file	\N	55	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0b4b002d-339d-418f-aff9-4f85353f4d71	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ac/edefd89c53c95c503256684dbb12f1586488db	edefd89c53c95c503256684dbb12f1586488db	file	\N	307	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
dad68a14-9d85-4ae0-b450-c2acb554e5fb	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/4a	4a	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1fbbbb73-5828-464a-b4a3-e1bc40d64657	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/4a/f6831385420aef3cdd41d16ee4445d5c3f45e0	f6831385420aef3cdd41d16ee4445d5c3f45e0	file	\N	465	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2da1d59d-b0fb-48f7-b823-56b2fa687e4d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/4a/b9f4a2ffc2560979ae9b7abb7e287ced308ec2	b9f4a2ffc2560979ae9b7abb7e287ced308ec2	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9b906753-2239-40c4-bad8-dee5ed37de1d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/e2	e2	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
bb7555f2-7b98-421b-9fac-18600967d371	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/e2/58bb117a9e9dc9bf45b4c55b70d0583f280559	58bb117a9e9dc9bf45b4c55b70d0583f280559	file	\N	319	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
de61e757-428d-4a58-8f39-96248b70fd8c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3d	3d	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
72cb7e8a-212a-4004-ad54-c2b61019694d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3d/6342abd2bb13412c1fd27c207a182d918cc5d8	6342abd2bb13412c1fd27c207a182d918cc5d8	file	\N	1410	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
11e75833-dc71-408c-9e6b-23291866142c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a1	a1	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cfbb6f32-592d-49f9-b7fb-1c039b7c7e68	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a1/4ffde01dc0b883381c9278766f61a44030eb80	4ffde01dc0b883381c9278766f61a44030eb80	file	\N	125	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b5f05fd4-d6d8-4db1-b879-115c293cdc31	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a1/637c7844d12f053c82ac307feb073dbd03a780	637c7844d12f053c82ac307feb073dbd03a780	file	\N	199775	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0f2dbbff-32b6-423f-ad63-c1eef7d60da8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/4c	4c	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d0c3f3a7-273b-41ce-97ce-733b21ec4017	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/4c/7c4a9a164fb2320477dcd2327cc353bd25ac6c	7c4a9a164fb2320477dcd2327cc353bd25ac6c	file	\N	497	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6c11a491-ca88-4de8-b75b-a85c00f0450f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/27	27	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3aba0ffd-87d7-4b32-9c59-5464d00197c1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/27/0e97f62d2306fd54984febb5af06c1b8b16e94	0e97f62d2306fd54984febb5af06c1b8b16e94	file	\N	164	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
71dcfc19-91cd-4846-81b1-f884cae29e8d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/27/1cb9bb28c4acc67c8cb82ddeffcb15b87806eb	1cb9bb28c4acc67c8cb82ddeffcb15b87806eb	file	\N	288	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3e7d416e-5ba0-41ca-b3f1-c9577c089bfe	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/9f	9f	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
44636e58-2cf7-4630-80d9-60d3359eb120	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/9f/d5605c411434e51a4938b5a57ae4ce841a7105	d5605c411434e51a4938b5a57ae4ce841a7105	file	\N	2119	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c4a2b990-ce31-4fb5-be4e-16981c79adf1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f2	f2	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
408c4edd-71e8-4c87-87b9-06ba5f6a2546	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f2/098db94d4ff2cb09754a00afe39d18d6b455ba	098db94d4ff2cb09754a00afe39d18d6b455ba	file	\N	157	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
167f5efb-857d-412c-81a9-d28cb0b51a8c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f2/67a1091ec68952a1b9dc0250ec3037996f057b	67a1091ec68952a1b9dc0250ec3037996f057b	file	\N	125	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3237a429-3c46-41d0-b99b-b3a586f88a10	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f2/24255b1e65838cc94efcfaaaab5ef9b9cb4a6d	24255b1e65838cc94efcfaaaab5ef9b9cb4a6d	file	\N	86623	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
15747948-e5c6-440a-aad7-0924a0abe07b	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/96	96	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d2a58b77-e67d-4786-af41-9b69325f043a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/96/fdbb0d12d876527191e945354209853b78ae17	fdbb0d12d876527191e945354209853b78ae17	file	\N	339	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8d1d2c13-1573-459e-9d12-7fbbf208d43d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/19	19	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a2a200e9-5356-4ba0-9a5b-d262bf9994f1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/19/9e303f85799fd28896afbc1f08de8d48a1338d	9e303f85799fd28896afbc1f08de8d48a1338d	file	\N	374	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
63399b91-aee2-4859-80f6-8a313e7127f0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/00	00	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e1b35c2a-6252-4fc0-91fd-2d08a735ef66	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/00/c46da6333673030c3711a3cf768fbfed098f56	c46da6333673030c3711a3cf768fbfed098f56	file	\N	1446	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
421783d3-2b33-4065-9cdb-4be8fdb03ec2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/00/2077d4f6bcff51616aebb39dc490c633239877	2077d4f6bcff51616aebb39dc490c633239877	file	\N	157	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ce34c643-d303-4ada-b599-a87e58b429fe	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/57	57	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
255a309c-b729-47b9-8d4e-621a582ab09c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/57/acf78152fb4a27f4b896df230d96bd9880990c	acf78152fb4a27f4b896df230d96bd9880990c	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
cea5a39c-0311-4c5c-9f84-2c1f7928f997	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/d8	d8	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ff0d0b15-9db1-4fb8-a2e2-ddc7a5fc0ded	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/d8/beedda2d9808790aab416afd5ff42b3e467bda	beedda2d9808790aab416afd5ff42b3e467bda	file	\N	497	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
03a86405-f3cb-4d24-9826-3876f18260b0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f0	f0	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
46bcc712-942a-4825-9dc4-a62c2da988b9	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f0/4ef4c1aaed8ed08f97cf2f9db16b74c292f03e	4ef4c1aaed8ed08f97cf2f9db16b74c292f03e	file	\N	53499	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4c4a980d-c3dc-4b1b-b9cb-5725a0e0313e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/66	66	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4512e517-4cd3-4d01-bcd6-5771cfbfe5b4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/66/9dfe441304103e32f6e45754ce768125fd87f0	9dfe441304103e32f6e45754ce768125fd87f0	file	\N	27699	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a704a63b-8a03-47c4-95d3-5546134f4a68	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/66/6d921a6ef5f4c899d447826ff3bb9206ba9631	6d921a6ef5f4c899d447826ff3bb9206ba9631	file	\N	97154	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c6431465-bbb2-49ca-8b7c-7f73c21f33f4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ba	ba	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
42ce8d51-16b8-4757-b67c-1d91e670d59c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ba/8bc823f0d70108f6b7b0edcec569f87cd4c1eb	8bc823f0d70108f6b7b0edcec569f87cd4c1eb	file	\N	26482	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5573d853-61af-4d40-a8e2-80b3d47f8410	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ba/d44e4f1a001d599d4b2cdd959fcfa2291b7293	d44e4f1a001d599d4b2cdd959fcfa2291b7293	file	\N	86	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c5550b56-f5f8-4a68-8621-c0b6ea97d6de	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/83	83	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
22943854-3b0c-4f5c-bbe4-97d2347f401d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/83/bb383f99182e0a08be541646f89acb9a48ed4b	bb383f99182e0a08be541646f89acb9a48ed4b	file	\N	322	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1e7f2477-2935-4e25-b93d-a4c95076f7ee	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/83/edc31efc972f55806301850faf6046091e6895	edc31efc972f55806301850faf6046091e6895	file	\N	157	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
92d3802f-021f-41f1-abf5-5fefa9417935	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ea	ea	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a1bd722e-c820-4a17-8b97-c175978711a3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ea/626b55755f6c8acc4c9fb7b9b98584160ec5b1	626b55755f6c8acc4c9fb7b9b98584160ec5b1	file	\N	196	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
dd4cc469-ccc2-4ef0-aae5-6b49d6dcbd7d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/1e	1e	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d0c11b4d-c8b3-49ab-8cfd-72ccf9be08a9	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/1e/61caff5ee0489563984e943d5985bcb6339d50	61caff5ee0489563984e943d5985bcb6339d50	file	\N	148	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
09efbaa3-1cea-4b10-a312-ebc6de9b3170	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/89	89	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e27614c3-6877-438c-a09d-eced60eed0a1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/89/ded5d7f7439ed439d14f2f7c29ea702f07a189	ded5d7f7439ed439d14f2f7c29ea702f07a189	file	\N	86	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2295380d-9aef-4882-a974-46f7118f3d08	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/36	36	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
00461203-ea69-4c8c-9959-a45c652cc175	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/36/15c3c3e254f0458dcb18e9b4f757cf9c6ff226	15c3c3e254f0458dcb18e9b4f757cf9c6ff226	file	\N	498	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0d92f25e-eefd-48d7-a4a5-ce974949b604	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ec	ec	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
dcfd7866-590a-4b05-b270-a9225a94311e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/ec/346309b2444a48ea13aa824f3722c91136da53	346309b2444a48ea13aa824f3722c91136da53	file	\N	21	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
afe415da-a153-4dbf-a546-40b06b8f1bbe	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/30	30	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9709e8b2-5340-42ce-a226-6b3850798a60	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/30/11b971e795b782d285ee34c9adf869af19dfcb	11b971e795b782d285ee34c9adf869af19dfcb	file	\N	178	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
579282c2-51f9-4187-b4e7-9cb5237f23bd	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/8f	8f	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c872e7bf-4f1c-4620-820d-7cd9360540ea	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/8f/02601e24ed506d553e785527f2a0d39eb7b16c	02601e24ed506d553e785527f2a0d39eb7b16c	file	\N	2269	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
76234544-1139-4969-a4f8-a463fe9b3000	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/8f/15a9b84b469b6e5f6f60928e3378848be56068	15a9b84b469b6e5f6f60928e3378848be56068	file	\N	1657	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ffd5e924-d353-4b84-9103-fa241f8167c7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/67	67	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
72e61f97-fd26-471b-a0a7-4be6ca6d3be1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/67/cb62ed3c76090de331825765b0bfe518ccc6ef	cb62ed3c76090de331825765b0bfe518ccc6ef	file	\N	679	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
ca350cb4-30dd-4915-a5f1-3f36248eded9	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/b3	b3	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3bb03656-543f-4fcd-b982-f5b70963b951	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/b3/7be8600d8f2b12d9ad0f995bc2109a61dd7e13	7be8600d8f2b12d9ad0f995bc2109a61dd7e13	file	\N	404	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
edf0f860-fb82-4409-a50c-31f237409f18	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/01	01	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e6b6a646-0c06-43ee-b4a7-c6ecf9d414f0	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/01/c535397be80e5a71cedee1bb10c60c4c7aae60	c535397be80e5a71cedee1bb10c60c4c7aae60	file	\N	661	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0f1300e3-7b8b-4343-9c1d-b4dd8e133a58	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a7	a7	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0bdd8199-8f7f-4f98-841d-69362b33df38	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a7/2f9b5e856cce44a73d1ca9f750e4c54081d2b2	2f9b5e856cce44a73d1ca9f750e4c54081d2b2	file	\N	252	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4da4280c-c588-4fa2-b1e5-c91d6519ba99	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/51	51	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
0ba94ca6-511c-4f64-b935-3fdefd3eb292	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/51/d202b07526a230dc99b4685a44486bf3b7afa7	d202b07526a230dc99b4685a44486bf3b7afa7	file	\N	352	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
214a6a69-afbd-4d0a-9cdd-5276bf3c9178	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/c2	c2	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6f582a95-8bfb-485f-b469-0f193921717e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/c2/d015b62c49ad3086bcd7b34577c65e1032f06b	d015b62c49ad3086bcd7b34577c65e1032f06b	file	\N	537	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e674366d-8cc3-42de-a2ad-9c556c670e99	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a2	a2	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c719db6e-ec3d-4fcf-986e-a25eec77df05	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/a2/a2d19699d3dd841d03981f5ef0272a06ae9304	a2d19699d3dd841d03981f5ef0272a06ae9304	file	\N	156	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e91f11d7-b8fb-4749-81ff-2f3eb4ea5ff4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/4b	4b	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2b195ac4-ec95-492e-beb2-b1dc7eb70999	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/4b/52f4e808f1cf59167e3ebc16f851ae75de08ef	52f4e808f1cf59167e3ebc16f851ae75de08ef	file	\N	126	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9de11cb9-7dfb-4f01-9fac-1f0a79b263e9	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/6c	6c	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
2ac5a5b5-2e5f-416d-9b9d-85dd5e5702f1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/6c/d603ff250cd9afe6e483caeabc62f0d2c096c2	d603ff250cd9afe6e483caeabc62f0d2c096c2	file	\N	201	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e8114038-1709-429c-add0-f3ddb9013765	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/6c/a3420d2d5c3857861a99112b65dadc28dd1d68	a3420d2d5c3857861a99112b65dadc28dd1d68	file	\N	424	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e063d0f6-30ff-4953-9efb-a9fcc442f0a4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/8e	8e	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f6d9d01c-2dd4-48ac-acbd-2a46e3efaa63	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/8e/f88ce029984ffa17810e2651e3adb5ca1af587	f88ce029984ffa17810e2651e3adb5ca1af587	file	\N	2980	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
58d4608a-31fb-4ea9-bacc-0b91c7e54ee4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/9a	9a	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
04362a18-986a-468f-be1b-efebc2d890fa	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/9a/9136f24519dfe9cc92c8079f3cb4e8c1b7469c	9136f24519dfe9cc92c8079f3cb4e8c1b7469c	file	\N	537	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
fecad826-d708-4506-9602-862012f305af	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f4	f4	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f10c2f7e-cc72-48a8-8a1f-5bded34a6216	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/f4/92402f0a92202150fa87ea6747a56f28cb5076	92402f0a92202150fa87ea6747a56f28cb5076	file	\N	92	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
03d69998-9601-40f2-88b7-88376fc2fae5	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3a	3a	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8ea0a06c-3259-4196-891f-415b3c1b7c3d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/3a/ea2550d238ab97ca9e6c66e0529b87dec2418c	ea2550d238ab97ca9e6c66e0529b87dec2418c	file	\N	87	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f20c9152-4a1e-4987-be64-fd5033caf01c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/60	60	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
199cec9f-c609-47cd-ba8d-371c365139d4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/60/4ccaea4cd3eaaa5c28a47dc10e104f5c3a3cfa	4ccaea4cd3eaaa5c28a47dc10e104f5c3a3cfa	file	\N	174	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
73072164-d169-4bea-a380-eed572b91428	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/cc	cc	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8b32cfdc-9b85-47c3-b584-27a6c4c932f4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/cc/415d9c7718b662a9c1543cd811e32d90d3bee7	415d9c7718b662a9c1543cd811e32d90d3bee7	file	\N	1984078	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
69335b2d-38e1-4ec0-b838-fa492d7df273	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/85	85	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5fa0ccfe-fcb9-407d-8dd1-5f785dabe18c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/85/2a9a7a01417ab77ef24654601b3b75278a3f18	2a9a7a01417ab77ef24654601b3b75278a3f18	file	\N	1909775	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1a354569-8e59-4161-ab7a-35c4115f1112	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/35	35	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
bf5d5a7f-60a8-42c1-b575-b60af3a9ae71	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/35/71b617b725a60073009d609498f86b0f58237e	71b617b725a60073009d609498f86b0f58237e	file	\N	65814	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a2370b65-d68c-44cf-98cf-0461d324414f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/4e	4e	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
317fcc3c-c987-4719-a33a-1b7279c82a7a	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/4e/89b17e75cd445b9ae444a0c461df883044e4a2	89b17e75cd445b9ae444a0c461df883044e4a2	file	\N	98234	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
c35c007e-043a-43b7-9ba4-587dd32cc17b	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/76	76	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
6a7f939d-7b19-4ca1-a9c2-aef84639caa1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/76/bf9f5fba25489527b04e201c13e03ce7778263	bf9f5fba25489527b04e201c13e03ce7778263	file	\N	169148	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
97bb3dd4-de0f-4414-a0de-93dafce1664e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/5c	5c	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9b88b843-fe92-4c57-acf1-3a03afee8cfa	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/5c/e1341e2eea25cba5ef7ca23af1225b0ceb45e1	e1341e2eea25cba5ef7ca23af1225b0ceb45e1	file	\N	152255	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
e878fea1-3bcb-44a2-8ef1-f72bccacce47	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/73	73	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
bb5411e6-33b8-425c-b9cb-d654e0706cb9	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/73/a09612bf0c01fba039eef35608968d9a598337	a09612bf0c01fba039eef35608968d9a598337	file	\N	268502	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
1042634e-5847-42c7-ac52-09d3b4623053	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/21	21	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
eaab81bd-f2b4-4226-8e16-71d2350130ff	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/21/80f24d67b85033f90878de23e95e1dbac43e91	80f24d67b85033f90878de23e95e1dbac43e91	file	\N	1190	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
076ec795-34f7-43ca-8e8a-1445e75959b7	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/da	da	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d2987b6c-6711-45f0-aec7-fb89436823f4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/da/f546720be09a0245b09431c4f35da070947d79	f546720be09a0245b09431c4f35da070947d79	file	\N	16626	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
a62d2fa2-34f3-4992-8502-4e55d38539da	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/cf	cf	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
14bcd023-08d7-4cc0-8a91-a67192ea7105	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/cf/e7118684fbd8b971ffbcabd652218f648bf085	e7118684fbd8b971ffbcabd652218f648bf085	file	\N	86	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f02a9930-2d39-40e7-acda-1406246df54f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/de	de	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
f0d7419b-9e84-4cfc-8beb-bd81f8627705	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/objects/de/1aa464ab5170c0912eebcb35323f06fcf70bd2	1aa464ab5170c0912eebcb35323f06fcf70bd2	file	\N	680	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
4d245631-f5c2-4057-b271-f714000a91c2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/logs	logs	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
12e652f4-386b-42f3-8ab4-f88076009623	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/logs/HEAD	HEAD	file	\N	2937	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8000e484-7838-4c40-a653-9c0807bb6671	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/logs/refs	refs	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
9e842af9-3713-48b6-9de4-9c015744a7bb	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/logs/refs/remotes	remotes	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
d6459d37-2268-460b-871a-0ad2f048f6a3	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/logs/refs/remotes/origin	origin	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
fc80a506-b297-4914-9181-70be1e28d1f9	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/logs/refs/remotes/origin/HEAD	HEAD	file	\N	175	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
23435787-d0d3-4848-ad5e-dab79ed3799e	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/logs/refs/remotes/origin/master	master	file	\N	2205	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
b143647c-25d8-401c-b6af-844912e5dec9	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/logs/refs/heads	heads	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
97fe82dd-8792-41ae-bcf0-b2f1cada7539	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.git/logs/refs/heads/master	master	file	\N	2937	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
51550a54-aa90-456d-a552-db88fb15e167	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.obsidian	.obsidian	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
30a0d553-1ca3-46bb-abfa-c7286aa85ec2	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.obsidian/core-plugins.json	core-plugins.json	file	\N	696	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
967ad688-8f7a-4043-938c-5dee91de2fd1	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.obsidian/app.json	app.json	file	\N	31	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
db7c8431-8179-4003-aff9-840fdb17d7a4	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.obsidian/appearance.json	appearance.json	file	\N	2	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
903f65f8-39ef-453a-a024-92f3d844eb7f	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.obsidian/workspace.json	workspace.json	file	\N	7499	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
98b81f55-6386-414e-a1a9-7f935d5bea33	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.crowdly	.crowdly	folder	\N	\N	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
10f65c2c-beea-4262-aa20-2f48a0aaed69	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.crowdly/happy_beings_context.md.seq	happy_beings_context.md.seq	file	\N	2	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
efcc3bf0-bcb6-40e6-9293-48979e1835bc	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.crowdly/happy_beings_context.md.updates.jsonl	happy_beings_context.md.updates.jsonl	file	\N	5615477	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
56470b44-2e0d-4f23-8e64-f1becea55ec8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.crowdly/happy_beings_context (4).md.seq	happy_beings_context (4).md.seq	file	\N	1	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
31a6e532-38fc-4ca8-8df2-49bddf9d81ff	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.crowdly/happy_beings_context (4).md.updates.jsonl	happy_beings_context (4).md.updates.jsonl	file	\N	344730	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
29e44ba8-b38e-4387-94a4-5d5759c6c383	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.crowdly/happy_beings_context_latest_10_January_2026_20-15.md.seq	happy_beings_context_latest_10_January_2026_20-15.md.seq	file	\N	3	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
833cd443-5003-4836-b4fb-d0cff802494c	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.crowdly/happy_beings_context_latest_10_January_2026_20-15.md.updates.jsonl	happy_beings_context_latest_10_January_2026_20-15.md.updates.jsonl	file	\N	108074516	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
8bdb69f2-dd27-472a-ab59-9b7e22e7350d	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.crowdly/master-20260111-131417.master.seq	master-20260111-131417.master.seq	file	\N	2	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
44dd32f4-8777-4b04-a9f0-9867680e4faa	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.crowdly/master-20260111-131417.master.updates.jsonl	master-20260111-131417.master.updates.jsonl	file	\N	471317	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
3c6878cc-8d66-4852-bf80-b97caf958823	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.crowdly/tech notes.md.seq	tech notes.md.seq	file	\N	2	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
5cd4599b-b599-41bc-9135-59f2369c02b8	0998becc-cd14-4d39-b8c1-ae77fb9567b8	.crowdly/tech notes.md.updates.jsonl	tech notes.md.updates.jsonl	file	\N	31353	\N	private	f	f	2026-01-12 17:37:37.400838+01	2026-01-12 17:37:37.400838+01	aef37573-600e-4442-9ae1-63a05799d9a0
\.


--
-- Data for Name: creative_spaces; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.creative_spaces (id, user_id, name, description, path, created_at, updated_at, visibility, published, default_item_visibility, last_synced_at, sync_state) FROM stdin;
a9bd793c-7d40-44b0-9d17-80992035a51d	agent-test-user	Agent Test Space	\N	\N	2025-12-17 16:09:45.046086+01	2025-12-17 16:09:45.046086+01	private	f	\N	\N	\N
46577979-a698-4498-a62a-3de3bc327635	aef37573-600e-4442-9ae1-63a05799d9a0	Veronika	\N	\N	2025-12-17 16:12:20.501201+01	2026-01-12 17:27:00.489603+01	private	f	\N	2026-01-12 17:27:00.489603+01	idle
0998becc-cd14-4d39-b8c1-ae77fb9567b8	aef37573-600e-4442-9ae1-63a05799d9a0	Happy Beings	\N	\N	2025-12-17 16:13:01.739209+01	2026-01-12 17:37:37.400838+01	private	f	\N	2026-01-12 17:37:37.400838+01	idle
bf5cccc0-2184-4ead-a5c5-77bb106a2d68	6fe20d11-0118-43b4-8439-ecd9738c8226	Test Space from Leo Force	\N	\N	2026-01-13 16:35:47.753209+01	2026-01-13 16:35:47.753209+01	private	f	\N	\N	\N
eb40fcb0-66a6-41b8-afaa-5b4533fdeb44	cad23ca1-121d-448f-8947-ddd5048ecb15	Test 123	\N	\N	2026-01-13 21:01:43.910487+01	2026-01-13 22:57:11.126781+01	private	f	\N	2026-01-13 22:57:11.126781+01	idle
b882b963-bb2e-47a7-b51a-b5ef9ab2af91	cad23ca1-121d-448f-8947-ddd5048ecb15	Test 33	\N	/home/lad/Sync stuff from Crowdly/Test 33	2026-01-13 20:22:40.770761+01	2026-01-13 22:57:15.722821+01	private	f	\N	2026-01-13 22:57:15.722821+01	idle
10620730-cec0-4672-80a0-d983b6841abf	6fe20d11-0118-43b4-8439-ecd9738c8226	New Space from Leo Force	\N	/home/lad/Sync stuff from Crowdly/New Space from Leo Force	2026-01-13 16:51:52.837888+01	2026-01-13 23:23:44.015535+01	private	f	\N	2026-01-13 23:23:44.015535+01	idle
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
6fe20d11-0118-43b4-8439-ecd9738c8226	leoforce@example.com	$2a$10$rfTAI06f19zt531DHrBmpusN35/v1qchiULzuKn6ixgm9jHd/39Ca	2026-01-13 16:34:34.837794+01
4b0fde23-9891-4c9a-80a0-f41646476bb0	4leo@leoloveis.me	$2a$10$KT28kRB.wNB2jXHI.AJasOJk15mH9.PSdiJcoqwg3P/4mZ.D5sTuG	2026-02-11 21:17:26.377337+01
\.


--
-- Data for Name: locales; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.locales (code, english_name, native_name, direction, enabled, created_at, updated_at) FROM stdin;
en	English	English	ltr	t	2026-01-09 17:06:24.947739+01	2026-02-11 21:12:26.651526+01
ru	Russian	Русский	ltr	t	2026-01-09 17:06:24.953415+01	2026-02-11 21:12:26.658744+01
pt	Portuguese	Português	ltr	t	2026-01-09 17:06:24.956627+01	2026-02-11 21:12:26.664037+01
kr	Korean	한국어	ltr	t	2026-01-09 17:06:24.959807+01	2026-02-11 21:12:26.669007+01
ar	Arabic	العربية	rtl	t	2026-01-09 17:06:24.961686+01	2026-02-11 21:12:26.671368+01
zh-Hans	Chinese (Simplified)	简体中文	ltr	t	2026-01-09 17:06:24.965034+01	2026-02-11 21:12:26.672958+01
zh-Hant	Chinese (Traditional)	繁體中文	ltr	t	2026-01-09 17:06:24.967524+01	2026-02-11 21:12:26.674478+01
ja	Japanese	日本語	ltr	t	2026-01-09 17:06:24.969897+01	2026-02-11 21:12:26.675781+01
fr	French	Français	ltr	t	2026-01-09 17:06:24.972028+01	2026-02-11 21:12:26.677614+01
es	Spanish	Español	ltr	t	2026-01-09 17:06:24.974189+01	2026-02-11 21:12:26.679838+01
de	German	Deutsch	ltr	t	2026-01-09 17:06:24.978093+01	2026-02-11 21:12:26.681507+01
zh	Chinese (unspecified script)	中文	ltr	t	2026-01-09 17:06:24.98017+01	2026-02-11 21:12:26.682921+01
hi	Hindi	हिन्दी	ltr	t	2026-01-09 17:06:24.98167+01	2026-02-11 21:12:26.684258+01
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
f7cc02dd-e2e8-44db-a804-da7040f29c19	bde622be-157c-49ff-a131-96d02a7e0284	0	\N	It is a series of short stories.	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:15:52.628119+01	Desktop sync	en	1
ba907ee2-2c3e-4610-8627-8a55ed755e71	f4985aa1-0b7d-4c64-9234-99288c0846b5	0		#New story by Leo Love	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:23:11.836369+01	Desktop sync	en	1
a037ec38-880a-4b8e-8039-2afad69184bd	f4985aa1-0b7d-4c64-9234-99288c0846b5	0	#New story by Leo Love	some intro text	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:40:50.235847+01	Desktop sync	en	2
b60f8342-6a5f-4d0c-b4bb-70e3c2dd08cc	0e4ec8f8-acb9-4c5e-be77-cda6021976fa	0	some intro text	Text of chapter 1	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:40:50.235847+01	Desktop sync	en	1
08c80311-f485-40b3-9642-f72d2155af86	988e930d-258c-40e1-aa52-7fa141eb1fb5	0	Text of chapter 1	Text of chapter 2	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:40:50.235847+01	Desktop sync	en	1
3377c6b9-cf12-4e8d-a072-5cfb487184b5	e94a297c-d4e3-417f-b04b-2146b521a668	0	Text of chapter 2	text for chapter 3	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:40:50.235847+01	Desktop sync	en	1
32467d22-41dc-4c19-a9ce-737922f67fe6	f23e7e91-9f17-4814-b422-f83188ed8897	0		some intro text	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:43:02.589403+01	Desktop sync	en	1
ee0fe899-2e1c-4bf9-98b4-bcd062e783eb	20c98a0f-5396-47af-982c-c418de96934b	0	test	Was a dark and cold one. It was rainy and windy outside.	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:47:21.993556+01	Desktop sync	en	1
a7dbdc89-019e-4a89-993c-ae9bea7a431c	520ff5b7-fc08-4c04-bdbb-8de2ad202972	0	as always	as always, as it should, it would be rather unusual if it wouldn't, however such a story is also not entirely impossible. :)	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:47:21.993556+01	Desktop sync	en	1
e717a256-3542-4645-a866-d44b3b60dfda	20c98a0f-5396-47af-982c-c418de96934b	0	Was a dark and cold one. It was rainy and windy outside.	Was a dark and cold one. It was rainy and windy outside - this however is not a problem for two people who are passionately in love.	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:48:06.022141+01	Desktop sync	en	2
1efd58ef-44b2-42f7-9801-a3859ae0ea39	5e88d7d5-6610-4e29-99b8-b2eadeab0141	0		some paragraph text here	cad23ca1-121d-448f-8947-ddd5048ecb15	2026-01-12 11:44:01.95984+01	Desktop sync	en	1
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.profiles (id, username, created_at, updated_at, first_name, last_name, nickname, about, bio, interests, profile_image_url, birthday, languages, social_facebook, social_snapchat, social_instagram, social_other, telephone, notify_phone, notify_app, notify_email, real_nickname, show_public_stories, show_public_screenplays, show_public_favorites, show_public_living, show_public_lived, favorites_visibility, living_visibility, lived_visibility, favorites_selected_user_ids, living_selected_user_ids, lived_selected_user_ids, stories_visibility, screenplays_visibility, stories_selected_user_ids, screenplays_selected_user_ids) FROM stdin;
61f38d4e-60a7-4836-9f43-1dfe7ddd00e7	leoforce@example.com	2025-05-05 17:37:32.335628+02	2025-05-05 17:37:32.335628+02	\N	\N	\N	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	t	t	\N	t	t	t	t	t	public	public	public	{}	{}	{}	public	public	{}	{}
e95ec2a3-c9de-4d3c-b516-1998deb243f2	leolove@example.com	2025-05-05 18:21:13.488887+02	2025-05-05 18:21:13.488887+02	\N	\N	\N	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	t	t	\N	t	t	t	t	t	public	public	public	{}	{}	{}	public	public	{}	{}
4b1454d7-f26c-4485-9e3f-614c92dcd0ae	leoforce@crowdly.org	2025-06-15 15:51:07.942667+02	2025-06-15 15:51:07.942667+02	\N	\N	\N	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	t	t	\N	t	t	t	t	t	public	public	public	{}	{}	{}	public	public	{}	{}
e28cf50b-29ce-4486-b1e6-085882b6dbe9	leoforce@growdly.online	2025-05-05 18:37:05.47367+02	2025-05-05 18:37:05.47367+02	Leo	Force	\N	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	f	f	\N	t	t	t	t	t	public	public	public	{}	{}	{}	public	public	{}	{}
6f542cd0-551b-4ec9-b2b0-61113dd7af2b	admin@example.com	2025-12-18 14:14:36.218696+01	2026-01-05 14:58:05.20482+01	\N	\N		\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	t	t	\N	t	t	t	t	t	public	public	public	{}	{}	{}	public	public	{}	{}
aef37573-600e-4442-9ae1-63a05799d9a0	leolove@example.com-aef37573	2025-12-17 16:58:44.976518+01	2026-01-14 14:50:16.050624+01	Leo	Love	leolove	\N	My name is Love, Leo Love :)	{reading,writing,travelling,"acquiring languages"}	\N	1980-08-09	{}	\N	\N	\N	\N	\N	f	t	f	Leo wise and happy, kind and gentle Love	f	f	f	f	f	private	private	private	{}	{}	{}	private	private	{}	{}
cad23ca1-121d-448f-8947-ddd5048ecb15	test@example.com	2025-12-17 17:14:34.761162+01	2026-01-05 15:26:06.560331+01	Тест	Тестов	test	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	t	t	試試	t	t	t	t	t	public	public	public	{}	{}	{}	public	public	{}	{}
6fe20d11-0118-43b4-8439-ecd9738c8226	leoforce@example.com-6fe20d11	2026-01-13 16:34:52.08019+01	2026-01-17 11:09:28.560404+01	Leo	Force	leoforce	\N	\N	{}	\N	\N	{}	\N	\N	\N	\N	\N	f	t	t	\N	t	t	t	t	t	public	public	public	{}	{}	{}	public	public	{}	{}
\.


--
-- Data for Name: reactions; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.reactions (id, user_id, story_title_id, chapter_id, paragraph_index, reaction_type, created_at, screenplay_id, screenplay_scene_id) FROM stdin;
6b9dc189-0017-4631-9947-41c0e9cd0f6e	aef37573-600e-4442-9ae1-63a05799d9a0	\N	\N	\N	like	2026-01-09 16:37:28.242399+01	055b3e41-4f7d-490f-9b29-128b908c3552	\N
051bbc7e-2e04-483d-9377-1b3d19c0f9e0	aef37573-600e-4442-9ae1-63a05799d9a0	\N	\N	\N	like	2026-01-09 16:37:33.932332+01	055b3e41-4f7d-490f-9b29-128b908c3552	8cb61e87-bf36-4319-9a98-482e2d18902a
73e41718-8c6d-4ba0-b24c-25f5da6cfabe	aef37573-600e-4442-9ae1-63a05799d9a0	\N	20c98a0f-5396-47af-982c-c418de96934b	\N	like	2026-01-09 16:52:16.430303+01	\N	\N
9b06e994-7297-4e7c-8c5b-5d27235ee367	aef37573-600e-4442-9ae1-63a05799d9a0	\N	\N	\N	like	2026-01-09 16:53:31.085509+01	055b3e41-4f7d-490f-9b29-128b908c3552	292145d3-40db-4016-a9e8-390381ba5991
\.


--
-- Data for Name: screenplay_access; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.screenplay_access (screenplay_id, user_id, role, created_at) FROM stdin;
aa04df6b-d6a8-4500-8b34-62dcd707649f	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-05 16:12:04.21068+01
65b04657-e10d-4418-9a91-40dd267e79dc	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-05 16:12:34.088721+01
c325ec65-87cc-45e5-bbd6-2e3b20f5f697	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-05 16:28:56.927546+01
055b3e41-4f7d-490f-9b29-128b908c3552	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	contributor	2026-01-07 13:04:58.43849+01
9c50b337-deb8-4501-9e9a-a3ff0323f6bd	aef37573-600e-4442-9ae1-63a05799d9a0	contributor	2026-01-06 10:41:26.666422+01
a90251c1-d8b0-4a5d-8ba2-7a84f427f86f	cad23ca1-121d-448f-8947-ddd5048ecb15	owner	2026-01-06 23:10:27.890609+01
afc667e9-aca2-476a-a6b2-ac9abd4607a1	cad23ca1-121d-448f-8947-ddd5048ecb15	owner	2026-01-06 23:24:40.271556+01
afc667e9-aca2-476a-a6b2-ac9abd4607a1	aef37573-600e-4442-9ae1-63a05799d9a0	contributor	2026-01-07 10:46:17.831482+01
6355d67a-d5a9-4ea2-949d-3307cc0c59a9	cad23ca1-121d-448f-8947-ddd5048ecb15	owner	2026-01-12 11:38:51.958373+01
6cfa304c-44f8-417b-ab31-d2dd598a5be5	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-15 18:17:11.183138+01
bba1b4ee-c529-4e83-8a4d-5666abd65272	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-15 18:31:25.872307+01
81340049-32ce-42cf-854e-3aeb8057ff7d	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-15 18:31:35.226663+01
055b3e41-4f7d-490f-9b29-128b908c3552	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-07 12:58:45.443523+01
24795a74-3423-45b1-a761-cf34dcd72a19	cad23ca1-121d-448f-8947-ddd5048ecb15	owner	2026-01-15 22:22:01.017269+01
879985af-785f-46b9-bfb1-b12b0274b469	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-21 12:21:59.888316+01
\.


--
-- Data for Name: screenplay_block; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.screenplay_block (block_id, screenplay_id, scene_id, block_index, block_type, text, metadata, created_at, updated_at) FROM stdin;
5ed25d77-276e-4265-9487-549945170973	689612ea-30fc-418b-882e-51dc2eb9775e	689a4f75-a1d4-4d1d-bf59-164311e9377c	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-05 13:39:39.78589+01	2026-01-05 13:39:39.78589+01
406336c9-d7b6-40d4-bcd2-1a741615cc94	689612ea-30fc-418b-882e-51dc2eb9775e	689a4f75-a1d4-4d1d-bf59-164311e9377c	2	character	CHARACTER NAME	\N	2026-01-05 13:39:39.78589+01	2026-01-05 13:39:39.78589+01
cdca5adc-3af9-407e-8cf1-b888da8f02e8	689612ea-30fc-418b-882e-51dc2eb9775e	689a4f75-a1d4-4d1d-bf59-164311e9377c	3	dialogue	This is a sample line of dialogue.	\N	2026-01-05 13:39:39.78589+01	2026-01-05 13:39:39.78589+01
a609dbd5-35f3-4483-b560-922852dfc77a	689612ea-30fc-418b-882e-51dc2eb9775e	689a4f75-a1d4-4d1d-bf59-164311e9377c	4	parenthetical	(whispering)	\N	2026-01-05 13:39:39.78589+01	2026-01-05 13:39:39.78589+01
5fe561dd-7041-40ac-acbc-62dc1d30e4ca	689612ea-30fc-418b-882e-51dc2eb9775e	689a4f75-a1d4-4d1d-bf59-164311e9377c	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-05 13:39:39.78589+01	2026-01-05 13:39:39.78589+01
7597ea65-6d0c-4208-b5cc-e07c1d9a9b20	689612ea-30fc-418b-882e-51dc2eb9775e	689a4f75-a1d4-4d1d-bf59-164311e9377c	6	transition	CUT TO:	\N	2026-01-05 13:39:39.78589+01	2026-01-05 13:39:39.78589+01
4965c659-b1e4-4949-8487-c74387447c64	98b90e1e-eae7-418d-984a-af5a91ec2084	657ab72a-c290-4fa1-8d0f-a96c4b0d17d2	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-05 13:41:28.570958+01	2026-01-05 13:41:28.570958+01
489c6920-a2aa-4a6a-996a-7a95df22cb9d	98b90e1e-eae7-418d-984a-af5a91ec2084	657ab72a-c290-4fa1-8d0f-a96c4b0d17d2	2	character	CHARACTER NAME	\N	2026-01-05 13:41:28.570958+01	2026-01-05 13:41:28.570958+01
14a92ef6-1244-41f4-8f92-81150a5bebf0	98b90e1e-eae7-418d-984a-af5a91ec2084	657ab72a-c290-4fa1-8d0f-a96c4b0d17d2	3	dialogue	This is a sample line of dialogue.	\N	2026-01-05 13:41:28.570958+01	2026-01-05 13:41:28.570958+01
ca0f7a7c-ae0b-46e4-ade0-61ee9f5107bd	98b90e1e-eae7-418d-984a-af5a91ec2084	657ab72a-c290-4fa1-8d0f-a96c4b0d17d2	4	parenthetical	(whispering)	\N	2026-01-05 13:41:28.570958+01	2026-01-05 13:41:28.570958+01
3a136e7b-0e06-4eaf-9087-db20ca73d7e5	98b90e1e-eae7-418d-984a-af5a91ec2084	657ab72a-c290-4fa1-8d0f-a96c4b0d17d2	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-05 13:41:28.570958+01	2026-01-05 13:41:28.570958+01
213a420b-67a9-419b-9cb9-e717de0093e2	98b90e1e-eae7-418d-984a-af5a91ec2084	657ab72a-c290-4fa1-8d0f-a96c4b0d17d2	6	transition	CUT TO:	\N	2026-01-05 13:41:28.570958+01	2026-01-05 13:41:28.570958+01
352e65bc-4239-404f-94b2-c3fdab511b7a	90368af4-fe7f-4fdb-a85b-62e24abce64f	26dadae4-8bad-41ae-b5e1-d7a38c9166fc	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-05 13:47:09.229914+01	2026-01-05 13:47:09.229914+01
d1e51641-92f3-4b61-a99a-650f1078e09a	90368af4-fe7f-4fdb-a85b-62e24abce64f	26dadae4-8bad-41ae-b5e1-d7a38c9166fc	2	character	CHARACTER NAME	\N	2026-01-05 13:47:09.229914+01	2026-01-05 13:47:09.229914+01
158a140a-5ef0-4462-8c7c-1d596cad219a	90368af4-fe7f-4fdb-a85b-62e24abce64f	26dadae4-8bad-41ae-b5e1-d7a38c9166fc	3	dialogue	This is a sample line of dialogue.	\N	2026-01-05 13:47:09.229914+01	2026-01-05 13:47:09.229914+01
61f6e573-4efe-4730-9d45-fafd5320db80	90368af4-fe7f-4fdb-a85b-62e24abce64f	26dadae4-8bad-41ae-b5e1-d7a38c9166fc	4	parenthetical	(whispering)	\N	2026-01-05 13:47:09.229914+01	2026-01-05 13:47:09.229914+01
ff0ec242-aa1d-42bd-95c9-4e70c2343b17	90368af4-fe7f-4fdb-a85b-62e24abce64f	26dadae4-8bad-41ae-b5e1-d7a38c9166fc	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-05 13:47:09.229914+01	2026-01-05 13:47:09.229914+01
84b647f3-cd8e-4917-b44b-58e822c8550c	90368af4-fe7f-4fdb-a85b-62e24abce64f	26dadae4-8bad-41ae-b5e1-d7a38c9166fc	6	transition	CUT TO:	\N	2026-01-05 13:47:09.229914+01	2026-01-05 13:47:09.229914+01
549d2c30-9f7d-4d9f-9a84-3a849aac9311	d88355ec-a569-44cf-bf2b-7582b236fe40	001bdf48-cf20-412f-9a41-c98ad6236e8a	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-05 13:48:17.441076+01	2026-01-05 13:48:17.441076+01
7c95e1b8-d108-4b37-9790-b117b8fc6af6	d88355ec-a569-44cf-bf2b-7582b236fe40	001bdf48-cf20-412f-9a41-c98ad6236e8a	2	character	CHARACTER NAME	\N	2026-01-05 13:48:17.441076+01	2026-01-05 13:48:17.441076+01
526d0b56-0d54-4aa0-8a19-cb684898cadd	d88355ec-a569-44cf-bf2b-7582b236fe40	001bdf48-cf20-412f-9a41-c98ad6236e8a	3	dialogue	This is a sample line of dialogue.	\N	2026-01-05 13:48:17.441076+01	2026-01-05 13:48:17.441076+01
63e5cd2c-b258-48a7-8f10-64ece8fd7d57	d88355ec-a569-44cf-bf2b-7582b236fe40	001bdf48-cf20-412f-9a41-c98ad6236e8a	4	parenthetical	(whispering)	\N	2026-01-05 13:48:17.441076+01	2026-01-05 13:48:17.441076+01
84e1a45a-9aab-40b5-91d1-25012d50bd1c	d88355ec-a569-44cf-bf2b-7582b236fe40	001bdf48-cf20-412f-9a41-c98ad6236e8a	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-05 13:48:17.441076+01	2026-01-05 13:48:17.441076+01
ca1d985f-a447-4c61-8130-5c68bcdcea7c	d88355ec-a569-44cf-bf2b-7582b236fe40	001bdf48-cf20-412f-9a41-c98ad6236e8a	6	transition	CUT TO:	\N	2026-01-05 13:48:17.441076+01	2026-01-05 13:48:17.441076+01
f32caf82-8c17-4da6-af0a-95a11a38e12b	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	32e420a2-7649-49d7-ac2b-8b4deaac9df5	2	character	CHARACTER NAME	\N	2026-01-05 13:49:32.500044+01	2026-01-05 13:49:32.500044+01
3cf82ded-460a-44a9-9bb7-5a7e91e5f20f	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	32e420a2-7649-49d7-ac2b-8b4deaac9df5	3	dialogue	This is a sample line of dialogue.	\N	2026-01-05 13:49:32.500044+01	2026-01-05 13:49:32.500044+01
bf3966de-2bfc-4164-8d92-37d5031c7097	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	32e420a2-7649-49d7-ac2b-8b4deaac9df5	4	parenthetical	(whispering)	\N	2026-01-05 13:49:32.500044+01	2026-01-05 13:49:32.500044+01
8863c199-7c33-4155-81e3-f3d30d367743	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	32e420a2-7649-49d7-ac2b-8b4deaac9df5	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-05 13:49:32.500044+01	2026-01-05 13:49:32.500044+01
12f45328-fbca-4384-9491-c569321b50f6	aa04df6b-d6a8-4500-8b34-62dcd707649f	73b7163d-aea5-4f17-8f04-29a402b72997	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-05 16:12:04.18007+01	2026-01-05 16:12:04.18007+01
5fd244c4-0422-48ff-91ee-904a047db424	aa04df6b-d6a8-4500-8b34-62dcd707649f	73b7163d-aea5-4f17-8f04-29a402b72997	2	character	CHARACTER NAME	\N	2026-01-05 16:12:04.18007+01	2026-01-05 16:12:04.18007+01
6e143c33-cf85-4dfc-855d-fb9a9f44a372	aa04df6b-d6a8-4500-8b34-62dcd707649f	73b7163d-aea5-4f17-8f04-29a402b72997	3	dialogue	This is a sample line of dialogue.	\N	2026-01-05 16:12:04.18007+01	2026-01-05 16:12:04.18007+01
ecc19f15-e0eb-4727-b61d-9b7f4ec31efa	aa04df6b-d6a8-4500-8b34-62dcd707649f	73b7163d-aea5-4f17-8f04-29a402b72997	4	parenthetical	(whispering)	\N	2026-01-05 16:12:04.18007+01	2026-01-05 16:12:04.18007+01
bc89ab92-2bbf-4a18-a3f6-e302437fb39d	aa04df6b-d6a8-4500-8b34-62dcd707649f	73b7163d-aea5-4f17-8f04-29a402b72997	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-05 16:12:04.18007+01	2026-01-05 16:12:04.18007+01
772cc8b8-94de-49a7-a27a-bc1447806cee	aa04df6b-d6a8-4500-8b34-62dcd707649f	73b7163d-aea5-4f17-8f04-29a402b72997	6	transition	CUT TO:	\N	2026-01-05 16:12:04.18007+01	2026-01-05 16:12:04.18007+01
682a3e5c-57b7-41f5-8f8d-650c20f4cd2d	65b04657-e10d-4418-9a91-40dd267e79dc	bc08bf70-e567-4c8c-a43c-8b3fbe2895c8	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-05 16:12:34.064023+01	2026-01-05 16:12:34.064023+01
eedb5adb-55f1-47fc-a62b-35118a5dd88a	65b04657-e10d-4418-9a91-40dd267e79dc	bc08bf70-e567-4c8c-a43c-8b3fbe2895c8	2	character	CHARACTER NAME	\N	2026-01-05 16:12:34.064023+01	2026-01-05 16:12:34.064023+01
c55bc9ba-e13d-4d08-92ea-77d3b8349d14	65b04657-e10d-4418-9a91-40dd267e79dc	bc08bf70-e567-4c8c-a43c-8b3fbe2895c8	3	dialogue	This is a sample line of dialogue.	\N	2026-01-05 16:12:34.064023+01	2026-01-05 16:12:34.064023+01
281bff97-f6eb-479f-9e69-827227a7cef8	65b04657-e10d-4418-9a91-40dd267e79dc	bc08bf70-e567-4c8c-a43c-8b3fbe2895c8	4	parenthetical	(whispering)	\N	2026-01-05 16:12:34.064023+01	2026-01-05 16:12:34.064023+01
be21542c-b1d4-4621-b243-35686ec25238	65b04657-e10d-4418-9a91-40dd267e79dc	bc08bf70-e567-4c8c-a43c-8b3fbe2895c8	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-05 16:12:34.064023+01	2026-01-05 16:12:34.064023+01
78326d60-e0eb-45df-adf0-f900f36c49d5	65b04657-e10d-4418-9a91-40dd267e79dc	bc08bf70-e567-4c8c-a43c-8b3fbe2895c8	6	transition	CUT TO:	\N	2026-01-05 16:12:34.064023+01	2026-01-05 16:12:34.064023+01
079e9c9d-6eea-4216-9093-00666bed068b	c325ec65-87cc-45e5-bbd6-2e3b20f5f697	3cd55d4d-bb87-4293-9be0-6f7708eec3fc	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-05 16:28:56.906466+01	2026-01-05 16:28:56.906466+01
abb186f4-1524-4e1e-864a-e4bb2d74bc97	c325ec65-87cc-45e5-bbd6-2e3b20f5f697	3cd55d4d-bb87-4293-9be0-6f7708eec3fc	2	character	CHARACTER NAME	\N	2026-01-05 16:28:56.906466+01	2026-01-05 16:28:56.906466+01
ad72c301-00c3-4946-8dab-a4766bf16f69	c325ec65-87cc-45e5-bbd6-2e3b20f5f697	3cd55d4d-bb87-4293-9be0-6f7708eec3fc	3	dialogue	This is a sample line of dialogue.	\N	2026-01-05 16:28:56.906466+01	2026-01-05 16:28:56.906466+01
1ae34cef-841d-4751-b83f-2a61ece81e7f	c325ec65-87cc-45e5-bbd6-2e3b20f5f697	3cd55d4d-bb87-4293-9be0-6f7708eec3fc	4	parenthetical	(whispering)	\N	2026-01-05 16:28:56.906466+01	2026-01-05 16:28:56.906466+01
93244965-ade8-414c-a165-cf310df94b64	c325ec65-87cc-45e5-bbd6-2e3b20f5f697	3cd55d4d-bb87-4293-9be0-6f7708eec3fc	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-05 16:28:56.906466+01	2026-01-05 16:28:56.906466+01
b16e2491-ced0-410c-aeb4-9b0d05253ff8	c325ec65-87cc-45e5-bbd6-2e3b20f5f697	3cd55d4d-bb87-4293-9be0-6f7708eec3fc	6	transition	CUT TO:	\N	2026-01-05 16:28:56.906466+01	2026-01-05 16:28:56.906466+01
05bae0ea-12e5-4de3-8d98-19ef05255f9e	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	32e420a2-7649-49d7-ac2b-8b4deaac9df5	6	transition	CUT TO:	\N	2026-01-05 13:49:32.500044+01	2026-01-06 10:41:26.658092+01
f8411934-b864-4e5f-937b-7310d33c63a9	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	32e420a2-7649-49d7-ac2b-8b4deaac9df5	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-05 13:49:32.500044+01	2026-01-06 23:08:24.398064+01
c297d068-d265-4ffb-befd-5317fba753bb	a90251c1-d8b0-4a5d-8ba2-7a84f427f86f	e3b365f9-7371-430c-bf03-644203777683	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-06 23:10:27.873896+01	2026-01-06 23:10:27.873896+01
53acd0ef-d325-4537-a568-eeac3d448945	a90251c1-d8b0-4a5d-8ba2-7a84f427f86f	e3b365f9-7371-430c-bf03-644203777683	2	character	CHARACTER NAME	\N	2026-01-06 23:10:27.873896+01	2026-01-06 23:10:27.873896+01
4cffafea-d238-4f20-95b8-75e414480d29	a90251c1-d8b0-4a5d-8ba2-7a84f427f86f	e3b365f9-7371-430c-bf03-644203777683	3	dialogue	This is a sample line of dialogue.	\N	2026-01-06 23:10:27.873896+01	2026-01-06 23:10:27.873896+01
3ff4bb4d-947e-4792-91c7-ebe647102bb3	a90251c1-d8b0-4a5d-8ba2-7a84f427f86f	e3b365f9-7371-430c-bf03-644203777683	4	parenthetical	(whispering)	\N	2026-01-06 23:10:27.873896+01	2026-01-06 23:10:27.873896+01
1c14fc49-ff82-4050-ae48-dd1c227208b9	a90251c1-d8b0-4a5d-8ba2-7a84f427f86f	e3b365f9-7371-430c-bf03-644203777683	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-06 23:10:27.873896+01	2026-01-06 23:10:27.873896+01
0c07bd46-133f-454e-a7c0-eebf663cb754	a90251c1-d8b0-4a5d-8ba2-7a84f427f86f	e3b365f9-7371-430c-bf03-644203777683	6	transition	CUT TO:	\N	2026-01-06 23:10:27.873896+01	2026-01-06 23:10:27.873896+01
1d654f38-e700-406e-9de3-44dd5ab3716a	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	7987126a-452e-4331-864f-34749fd10a2f	1	character	INT - AT HOME - DAY	\N	2026-01-12 11:51:18.962498+01	2026-01-12 11:51:18.962498+01
9ce03341-28b4-4dea-a0ff-c79b16aac0ac	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	7987126a-452e-4331-864f-34749fd10a2f	2	action	Sitting at my desk and writing this text	\N	2026-01-12 11:51:18.962498+01	2026-01-12 11:51:18.962498+01
7a5ae7dd-f5f4-4f3e-9259-53ba25f01391	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	190d16ae-1b56-4a75-a278-639e1eec2a31	3	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-12 11:51:18.962498+01	2026-01-12 11:51:18.962498+01
0363f3b1-a65b-480e-9330-c57853c06a57	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	190d16ae-1b56-4a75-a278-639e1eec2a31	4	character	CHARACTER NAME	\N	2026-01-12 11:51:18.962498+01	2026-01-12 11:51:18.962498+01
fcb042c2-a783-420f-92d8-2641cbcb225c	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	190d16ae-1b56-4a75-a278-639e1eec2a31	5	action	This is a sample line of dialogue.	\N	2026-01-12 11:51:18.962498+01	2026-01-12 11:51:18.962498+01
f85b3de6-36d1-490d-96ca-3894d10cc90e	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	190d16ae-1b56-4a75-a278-639e1eec2a31	6	parenthetical	(whispering)	\N	2026-01-12 11:51:18.962498+01	2026-01-12 11:51:18.962498+01
4914d63d-d0b7-4109-832d-439462fe64b3	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	190d16ae-1b56-4a75-a278-639e1eec2a31	7	action	Another line, with a parenthetical above it.	\N	2026-01-12 11:51:18.962498+01	2026-01-12 11:51:18.962498+01
2006b6e1-5437-4b60-b9bb-ba73b84564be	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	190d16ae-1b56-4a75-a278-639e1eec2a31	8	transition	CUT TO:	\N	2026-01-12 11:51:18.962498+01	2026-01-12 11:51:18.962498+01
c735defd-7688-4345-b7d8-6a2e0ca8e1fc	24795a74-3423-45b1-a761-cf34dcd72a19	9ac85e02-b2de-419b-bdee-169932290e31	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-15 22:22:00.976718+01	2026-01-15 22:22:00.976718+01
8d59e88c-fc0c-4e53-8acd-762ea9f8b043	24795a74-3423-45b1-a761-cf34dcd72a19	9ac85e02-b2de-419b-bdee-169932290e31	2	character	CHARACTER NAME	\N	2026-01-15 22:22:00.976718+01	2026-01-15 22:22:00.976718+01
af392c9e-d3fa-4002-af54-461c312be5e4	24795a74-3423-45b1-a761-cf34dcd72a19	9ac85e02-b2de-419b-bdee-169932290e31	3	dialogue	This is a sample line of dialogue.	\N	2026-01-15 22:22:00.976718+01	2026-01-15 22:22:00.976718+01
6085e96c-48e1-45f7-987b-8a553b815867	24795a74-3423-45b1-a761-cf34dcd72a19	9ac85e02-b2de-419b-bdee-169932290e31	4	parenthetical	(whispering)	\N	2026-01-15 22:22:00.976718+01	2026-01-15 22:22:00.976718+01
b1619e8d-a519-4099-8277-a6f70abc84b5	24795a74-3423-45b1-a761-cf34dcd72a19	9ac85e02-b2de-419b-bdee-169932290e31	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-15 22:22:00.976718+01	2026-01-15 22:22:00.976718+01
dcc70d1f-42c3-47c7-8709-71dc9403ec99	24795a74-3423-45b1-a761-cf34dcd72a19	9ac85e02-b2de-419b-bdee-169932290e31	6	transition	CUT TO:	\N	2026-01-15 22:22:00.976718+01	2026-01-15 22:22:00.976718+01
bb4a0286-6f65-43c2-8155-80ccbde0ba8e	055b3e41-4f7d-490f-9b29-128b908c3552	8cb61e87-bf36-4319-9a98-482e2d18902a	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
dbe55e62-662a-43a5-90d6-39a2b237f285	055b3e41-4f7d-490f-9b29-128b908c3552	8cb61e87-bf36-4319-9a98-482e2d18902a	3	action	This is a sample line of dialogue.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
dd349a90-b526-4bda-9747-cc20f60d9702	055b3e41-4f7d-490f-9b29-128b908c3552	8cb61e87-bf36-4319-9a98-482e2d18902a	4	parenthetical	(whispering)	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
af0f0f22-a248-4a1b-a3a6-fbdbd5710520	055b3e41-4f7d-490f-9b29-128b908c3552	8cb61e87-bf36-4319-9a98-482e2d18902a	5	action	Another line, with a parenthetical above it.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
6d72e9d7-69fd-4c69-958f-d123704280dd	055b3e41-4f7d-490f-9b29-128b908c3552	8cb61e87-bf36-4319-9a98-482e2d18902a	6	transition	CUT TO:	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
982738ce-d212-4864-b9c4-c7bb963432a7	055b3e41-4f7d-490f-9b29-128b908c3552	292145d3-40db-4016-a9e8-390381ba5991	7	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
4655742d-fc5c-4e12-a535-f7ea5e13d70d	055b3e41-4f7d-490f-9b29-128b908c3552	292145d3-40db-4016-a9e8-390381ba5991	8	character	CHARACTER NAME	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
76b3492a-5aeb-4f17-9538-cd72fadbcafe	055b3e41-4f7d-490f-9b29-128b908c3552	292145d3-40db-4016-a9e8-390381ba5991	9	action	This is a sample line of dialogue.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
7a93b3ff-0dff-4f9d-a956-e3c3d6061b11	055b3e41-4f7d-490f-9b29-128b908c3552	292145d3-40db-4016-a9e8-390381ba5991	10	parenthetical	(whispering)	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
ecdeee5f-24cc-486f-9e7d-859787171014	055b3e41-4f7d-490f-9b29-128b908c3552	292145d3-40db-4016-a9e8-390381ba5991	11	action	Another line, with a parenthetical above it.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
63c1096b-ca26-472d-9036-f288b26cb0a1	055b3e41-4f7d-490f-9b29-128b908c3552	292145d3-40db-4016-a9e8-390381ba5991	12	transition	CUT TO:	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
473f0c36-fdfc-4c04-be04-afe88dd321ae	055b3e41-4f7d-490f-9b29-128b908c3552	9f090605-e990-4905-b47b-adf0bbe9020f	13	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
5c891d86-1df7-46f3-80d8-bf71902eb44e	055b3e41-4f7d-490f-9b29-128b908c3552	9f090605-e990-4905-b47b-adf0bbe9020f	14	character	CHARACTER NAME	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
16652698-28c4-4eab-8193-ccbe01c81704	055b3e41-4f7d-490f-9b29-128b908c3552	9f090605-e990-4905-b47b-adf0bbe9020f	15	action	This is a sample line of dialogue.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
3f8652bc-b427-41a7-b0ef-e1312d3737ff	055b3e41-4f7d-490f-9b29-128b908c3552	9f090605-e990-4905-b47b-adf0bbe9020f	16	parenthetical	(whispering)	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
c38b559c-8f58-4d8d-9198-d38e3363b2cd	055b3e41-4f7d-490f-9b29-128b908c3552	9f090605-e990-4905-b47b-adf0bbe9020f	17	action	Another line, with a parenthetical above it.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
3004c65e-1f90-46ef-8d8c-fa24cc904a40	055b3e41-4f7d-490f-9b29-128b908c3552	9f090605-e990-4905-b47b-adf0bbe9020f	18	transition	CUT TO:	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
1d29c8fb-29fc-4ee2-a353-53881e70f530	055b3e41-4f7d-490f-9b29-128b908c3552	6bce87ed-561f-45ad-9d2d-4325c3157f34	19	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
6c688fab-bd43-4e9a-bece-134ca93c7e65	055b3e41-4f7d-490f-9b29-128b908c3552	6bce87ed-561f-45ad-9d2d-4325c3157f34	20	character	CHARACTER NAME	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
bc5c3fc0-7ede-4e5f-aa8e-599ed907c347	055b3e41-4f7d-490f-9b29-128b908c3552	6bce87ed-561f-45ad-9d2d-4325c3157f34	21	action	This is a sample line of dialogue.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
d6fd30c4-3075-4847-a2ac-72c4a13060c1	055b3e41-4f7d-490f-9b29-128b908c3552	6bce87ed-561f-45ad-9d2d-4325c3157f34	22	parenthetical	(whispering)	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
f3aefa63-da5b-4f68-b38a-12e37596b41b	055b3e41-4f7d-490f-9b29-128b908c3552	6bce87ed-561f-45ad-9d2d-4325c3157f34	23	action	Another line, with a parenthetical above it.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
5834e6bb-86d7-4dbd-8181-5b298b580a22	055b3e41-4f7d-490f-9b29-128b908c3552	6bce87ed-561f-45ad-9d2d-4325c3157f34	24	transition	CUT TO:	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
36157102-bb65-436f-9587-15c21edee59f	055b3e41-4f7d-490f-9b29-128b908c3552	97b445cc-184c-4d19-b89b-1d16b52dce0b	25	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
ca805a65-7cbc-46f0-84b7-1cd00b882e0e	055b3e41-4f7d-490f-9b29-128b908c3552	97b445cc-184c-4d19-b89b-1d16b52dce0b	26	character	CHARACTER NAME	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
cf4a2e8b-97ab-4d89-9eb7-dc0fa8583ffb	055b3e41-4f7d-490f-9b29-128b908c3552	97b445cc-184c-4d19-b89b-1d16b52dce0b	27	action	This is a sample line of dialogue.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
a16ae1a3-a46d-46e6-8090-35d7696a1fed	055b3e41-4f7d-490f-9b29-128b908c3552	97b445cc-184c-4d19-b89b-1d16b52dce0b	28	parenthetical	(whispering)	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
376d4869-ddd8-4000-ad4c-0fd2d0af8aaf	055b3e41-4f7d-490f-9b29-128b908c3552	97b445cc-184c-4d19-b89b-1d16b52dce0b	29	action	Another line, with a parenthetical above it.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
e330edcf-d821-4a69-bff6-b49de647a696	055b3e41-4f7d-490f-9b29-128b908c3552	97b445cc-184c-4d19-b89b-1d16b52dce0b	30	transition	CUT TO:	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
658ca18e-0dbc-453d-b163-8c79652e2f63	055b3e41-4f7d-490f-9b29-128b908c3552	8cb61e87-bf36-4319-9a98-482e2d18902a	2	character	CHARACTER NAME	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:59:21.790714+01
b2084f57-9360-44a0-98c6-c1fa3184700b	6cfa304c-44f8-417b-ab31-d2dd598a5be5	b998aef1-ce04-4e39-ae20-b685ecfd9d87	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-15 18:17:11.159007+01	2026-01-15 18:17:11.159007+01
2a89d244-aa62-4d13-9a1c-1a9cdd764ba5	6cfa304c-44f8-417b-ab31-d2dd598a5be5	b998aef1-ce04-4e39-ae20-b685ecfd9d87	2	character	CHARACTER NAME	\N	2026-01-15 18:17:11.159007+01	2026-01-15 18:17:11.159007+01
a8bf4d1a-df81-406b-9d8d-72ecb6fbf97e	6cfa304c-44f8-417b-ab31-d2dd598a5be5	b998aef1-ce04-4e39-ae20-b685ecfd9d87	3	dialogue	This is a sample line of dialogue.	\N	2026-01-15 18:17:11.159007+01	2026-01-15 18:17:11.159007+01
15048e1d-bf08-4168-a7b2-0dda21bb3bcf	6cfa304c-44f8-417b-ab31-d2dd598a5be5	b998aef1-ce04-4e39-ae20-b685ecfd9d87	4	parenthetical	(whispering)	\N	2026-01-15 18:17:11.159007+01	2026-01-15 18:17:11.159007+01
a0f63acd-2aa7-4405-8470-94f18013a120	6cfa304c-44f8-417b-ab31-d2dd598a5be5	b998aef1-ce04-4e39-ae20-b685ecfd9d87	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-15 18:17:11.159007+01	2026-01-15 18:17:11.159007+01
64332ea5-94c4-408d-bc31-8c701fa8a2e6	6cfa304c-44f8-417b-ab31-d2dd598a5be5	b998aef1-ce04-4e39-ae20-b685ecfd9d87	6	transition	CUT TO:	\N	2026-01-15 18:17:11.159007+01	2026-01-15 18:17:11.159007+01
2a011240-d2ce-464e-8f36-6ec1770df318	879985af-785f-46b9-bfb1-b12b0274b469	cec09529-843c-4863-a527-3b5995e29c19	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-21 12:21:59.857721+01	2026-01-21 12:21:59.857721+01
d6529f44-bd07-4d34-9349-cff0ed7e48a4	879985af-785f-46b9-bfb1-b12b0274b469	cec09529-843c-4863-a527-3b5995e29c19	2	character	CHARACTER NAME	\N	2026-01-21 12:21:59.857721+01	2026-01-21 12:21:59.857721+01
5a674592-bbcc-43d6-901d-aa800dac8604	879985af-785f-46b9-bfb1-b12b0274b469	cec09529-843c-4863-a527-3b5995e29c19	3	dialogue	This is a sample line of dialogue.	\N	2026-01-21 12:21:59.857721+01	2026-01-21 12:21:59.857721+01
baed4f22-ea27-48a0-b269-e8b961201b3f	879985af-785f-46b9-bfb1-b12b0274b469	cec09529-843c-4863-a527-3b5995e29c19	4	parenthetical	(whispering)	\N	2026-01-21 12:21:59.857721+01	2026-01-21 12:21:59.857721+01
7a5fb051-06b6-46ec-b78e-15355473f6bd	879985af-785f-46b9-bfb1-b12b0274b469	cec09529-843c-4863-a527-3b5995e29c19	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-21 12:21:59.857721+01	2026-01-21 12:21:59.857721+01
cd8bd034-2857-4cbe-82ac-590ab07d78cb	879985af-785f-46b9-bfb1-b12b0274b469	cec09529-843c-4863-a527-3b5995e29c19	6	transition	CUT TO:	\N	2026-01-21 12:21:59.857721+01	2026-01-21 12:21:59.857721+01
c518f2a7-e001-48ea-b0b3-141a0a50939a	055b3e41-4f7d-490f-9b29-128b908c3552	80de4ea7-8a44-410d-9256-5941f5a2f95a	31	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
c1f07697-19da-4d64-8482-dfb2af3f64c6	055b3e41-4f7d-490f-9b29-128b908c3552	80de4ea7-8a44-410d-9256-5941f5a2f95a	32	character	CHARACTER NAME	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
ff94213f-1679-4fa9-a432-a2cec9ced3a6	055b3e41-4f7d-490f-9b29-128b908c3552	80de4ea7-8a44-410d-9256-5941f5a2f95a	33	action	This is a sample line of dialogue.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
71b3845b-affd-4641-96d5-0c2e8a4274ba	055b3e41-4f7d-490f-9b29-128b908c3552	80de4ea7-8a44-410d-9256-5941f5a2f95a	34	parenthetical	(whispering)	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
27156373-8267-4a5f-a92c-033bd4c9733f	055b3e41-4f7d-490f-9b29-128b908c3552	80de4ea7-8a44-410d-9256-5941f5a2f95a	35	action	Another line, with a parenthetical above it.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
0fedfdcd-a70c-4bdb-86f9-3e3e3c8a2d5f	055b3e41-4f7d-490f-9b29-128b908c3552	80de4ea7-8a44-410d-9256-5941f5a2f95a	36	transition	CUT TO:	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
832af236-7645-4e7d-9162-ab1ba7aa9ef0	afc667e9-aca2-476a-a6b2-ac9abd4607a1	bf2729c9-2009-4a1d-b12f-e8a1f461b358	12	action	Another line, with a parenthetical above it.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
fa771bb0-4bb4-4a5e-85d6-28f3b155433e	afc667e9-aca2-476a-a6b2-ac9abd4607a1	bf2729c9-2009-4a1d-b12f-e8a1f461b358	13	transition	CUT TO:	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
b4cf1618-d8e0-456b-a789-fd492e55dfe9	afc667e9-aca2-476a-a6b2-ac9abd4607a1	3859cbb9-f5c6-4502-874e-4248a2dfdff5	14	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
6fd78910-ad78-4caf-9901-a817fae1d708	afc667e9-aca2-476a-a6b2-ac9abd4607a1	3859cbb9-f5c6-4502-874e-4248a2dfdff5	15	character	CHARACTER NAME	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
8d9b0572-1932-484f-97aa-8039f16abc4d	afc667e9-aca2-476a-a6b2-ac9abd4607a1	3859cbb9-f5c6-4502-874e-4248a2dfdff5	16	action	This is a sample line of dialogue.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
0f17a21e-683b-47ac-9cdb-8c2c3cde0156	afc667e9-aca2-476a-a6b2-ac9abd4607a1	3859cbb9-f5c6-4502-874e-4248a2dfdff5	17	action	(whispering4	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
737366f7-f87c-4082-a759-1d69a4e069d8	afc667e9-aca2-476a-a6b2-ac9abd4607a1	3859cbb9-f5c6-4502-874e-4248a2dfdff5	18	action	Another line, with a parenthetical above it.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
51886142-2552-4872-b1eb-6dc4043ad595	afc667e9-aca2-476a-a6b2-ac9abd4607a1	3859cbb9-f5c6-4502-874e-4248a2dfdff5	19	transition	CUT TO:	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
fc81224e-4fb5-4a2a-903d-5f84cc8764bf	afc667e9-aca2-476a-a6b2-ac9abd4607a1	51f978fc-a78b-414c-9bde-e402a4603bf0	20	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
6e4ac781-597e-4d94-bd39-c3fdc26509df	afc667e9-aca2-476a-a6b2-ac9abd4607a1	51f978fc-a78b-414c-9bde-e402a4603bf0	21	character	CHARACTER NAME	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
7552b09b-b08e-46b2-9c6c-495c516e8343	afc667e9-aca2-476a-a6b2-ac9abd4607a1	51f978fc-a78b-414c-9bde-e402a4603bf0	22	action	This is a sample line of dialogue.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
f3996dc3-f43c-409e-9c13-c317e833e027	afc667e9-aca2-476a-a6b2-ac9abd4607a1	51f978fc-a78b-414c-9bde-e402a4603bf0	23	parenthetical	(whispering)	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
ed13d951-4010-4205-8ec1-2756bcfe411f	afc667e9-aca2-476a-a6b2-ac9abd4607a1	51f978fc-a78b-414c-9bde-e402a4603bf0	24	action	Another line, with a parenthetical above it.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
3e96f65c-c89b-4fd1-a9bf-207f46000308	afc667e9-aca2-476a-a6b2-ac9abd4607a1	51f978fc-a78b-414c-9bde-e402a4603bf0	25	transition	CUT TO:	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
1f36ce7a-2c9b-494e-bc47-6909ac6889c3	bba1b4ee-c529-4e83-8a4d-5666abd65272	71af1f20-9b1f-4023-a56f-1db6381bde0c	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-15 18:31:25.834292+01	2026-01-15 18:31:25.834292+01
381b4084-0d2a-4160-a779-c5c452296997	bba1b4ee-c529-4e83-8a4d-5666abd65272	71af1f20-9b1f-4023-a56f-1db6381bde0c	2	character	CHARACTER NAME	\N	2026-01-15 18:31:25.834292+01	2026-01-15 18:31:25.834292+01
a7dac65f-9c46-4ae5-a629-327aac37ef05	bba1b4ee-c529-4e83-8a4d-5666abd65272	71af1f20-9b1f-4023-a56f-1db6381bde0c	3	dialogue	This is a sample line of dialogue.	\N	2026-01-15 18:31:25.834292+01	2026-01-15 18:31:25.834292+01
c28b53f2-f2a6-421c-8ca7-7b5e7058e609	bba1b4ee-c529-4e83-8a4d-5666abd65272	71af1f20-9b1f-4023-a56f-1db6381bde0c	4	parenthetical	(whispering)	\N	2026-01-15 18:31:25.834292+01	2026-01-15 18:31:25.834292+01
350e8226-86a7-417f-b4aa-020e7abd7ca3	bba1b4ee-c529-4e83-8a4d-5666abd65272	71af1f20-9b1f-4023-a56f-1db6381bde0c	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-15 18:31:25.834292+01	2026-01-15 18:31:25.834292+01
f992b989-7911-48a4-93cb-c13c0d11c058	bba1b4ee-c529-4e83-8a4d-5666abd65272	71af1f20-9b1f-4023-a56f-1db6381bde0c	6	transition	CUT TO:	\N	2026-01-15 18:31:25.834292+01	2026-01-15 18:31:25.834292+01
59a74597-f6b5-44cc-8cca-7c31fd1ae782	81340049-32ce-42cf-854e-3aeb8057ff7d	99785031-43a2-4ed8-ac18-c2ef935ca236	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-15 18:31:35.216703+01	2026-01-15 18:31:35.216703+01
261ccf54-6e9c-41a6-93a6-8574f092a9c1	81340049-32ce-42cf-854e-3aeb8057ff7d	99785031-43a2-4ed8-ac18-c2ef935ca236	2	character	CHARACTER NAME	\N	2026-01-15 18:31:35.216703+01	2026-01-15 18:31:35.216703+01
8a499fa9-094a-4aca-96cf-80ef02276eaf	81340049-32ce-42cf-854e-3aeb8057ff7d	99785031-43a2-4ed8-ac18-c2ef935ca236	3	dialogue	This is a sample line of dialogue.	\N	2026-01-15 18:31:35.216703+01	2026-01-15 18:31:35.216703+01
4e53bccf-167c-486b-b26b-80c3cc6137ba	81340049-32ce-42cf-854e-3aeb8057ff7d	99785031-43a2-4ed8-ac18-c2ef935ca236	4	parenthetical	(whispering)	\N	2026-01-15 18:31:35.216703+01	2026-01-15 18:31:35.216703+01
74c8687d-bddf-49e1-a593-3d049b7fb29e	81340049-32ce-42cf-854e-3aeb8057ff7d	99785031-43a2-4ed8-ac18-c2ef935ca236	5	dialogue	Another line, with a parenthetical above it.	\N	2026-01-15 18:31:35.216703+01	2026-01-15 18:31:35.216703+01
8ca97cbd-1df8-46ef-867f-cc28932d1d83	81340049-32ce-42cf-854e-3aeb8057ff7d	99785031-43a2-4ed8-ac18-c2ef935ca236	6	transition	CUT TO:	\N	2026-01-15 18:31:35.216703+01	2026-01-15 18:31:35.216703+01
566ebdbe-711a-40df-92ac-d92486051fa0	055b3e41-4f7d-490f-9b29-128b908c3552	36b7138f-9fc5-4347-a410-a2c5f9098c2b	37	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
86cd9164-cf77-4f7f-a7fe-371ea9fdf58c	055b3e41-4f7d-490f-9b29-128b908c3552	36b7138f-9fc5-4347-a410-a2c5f9098c2b	38	character	CHARACTER NAME	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
f75bb806-b3d1-458d-b62d-1b1ed95d67da	055b3e41-4f7d-490f-9b29-128b908c3552	36b7138f-9fc5-4347-a410-a2c5f9098c2b	40	parenthetical	(whispering)	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
e53b8cc7-97f2-4da4-8fac-d52733aa0940	055b3e41-4f7d-490f-9b29-128b908c3552	36b7138f-9fc5-4347-a410-a2c5f9098c2b	41	action	Another line, with a parenthetical above it.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
f4bf02a4-d1ac-4b89-9edf-3237abab6eb0	055b3e41-4f7d-490f-9b29-128b908c3552	36b7138f-9fc5-4347-a410-a2c5f9098c2b	42	transition	CUT TO:	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
a7d119d8-4d2e-46c4-ace9-4000ea530fc9	055b3e41-4f7d-490f-9b29-128b908c3552	a879ffa0-9984-4667-b7d4-87a665fc5b6f	43	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
cd6e116f-3114-42a2-93e3-09b4b32125ab	055b3e41-4f7d-490f-9b29-128b908c3552	a879ffa0-9984-4667-b7d4-87a665fc5b6f	44	character	CHARACTER NAME	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
4b367e71-2d4a-4518-9e48-e297317c65eb	055b3e41-4f7d-490f-9b29-128b908c3552	a879ffa0-9984-4667-b7d4-87a665fc5b6f	45	action	This is a sample line of dialogue.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
40d2bb9d-fc28-4d1e-a132-9adba12012b7	055b3e41-4f7d-490f-9b29-128b908c3552	a879ffa0-9984-4667-b7d4-87a665fc5b6f	46	parenthetical	(whispering)	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
8fa0bcf7-f7e7-470e-b6c9-22805be66afb	055b3e41-4f7d-490f-9b29-128b908c3552	a879ffa0-9984-4667-b7d4-87a665fc5b6f	47	action	Another line, with a parenthetical above it.	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
bad2360c-4a36-4417-929f-82797dd2d183	055b3e41-4f7d-490f-9b29-128b908c3552	a879ffa0-9984-4667-b7d4-87a665fc5b6f	48	transition	CUT TO:	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
4e8fdb27-24b7-4b1e-b3cb-1a0e3eafe17e	afc667e9-aca2-476a-a6b2-ac9abd4607a1	fbd2da52-50f6-437b-97f8-dc4edbceae1d	1	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
bd539283-723a-49bd-a6d9-00148c620637	afc667e9-aca2-476a-a6b2-ac9abd4607a1	fbd2da52-50f6-437b-97f8-dc4edbceae1d	2	action	Sitting at the desk 	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
b7154e12-3b8c-4850-834d-9cf907c306a9	afc667e9-aca2-476a-a6b2-ac9abd4607a1	fbd2da52-50f6-437b-97f8-dc4edbceae1d	3	character	CHARACTER NAME	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
9aefcf85-7ee4-41a1-b289-8e456a609b03	afc667e9-aca2-476a-a6b2-ac9abd4607a1	fbd2da52-50f6-437b-97f8-dc4edbceae1d	4	action	This is a sample line of dialogue.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
40cc7a63-a388-4ebf-a3f6-1ca3fb5b6e97	afc667e9-aca2-476a-a6b2-ac9abd4607a1	fbd2da52-50f6-437b-97f8-dc4edbceae1d	5	parenthetical	(whispering)	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
eb4308c4-65e8-4267-b8e7-29767362b6ae	afc667e9-aca2-476a-a6b2-ac9abd4607a1	fbd2da52-50f6-437b-97f8-dc4edbceae1d	6	action	Another line, with a parenthetical above it.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
56b11d1f-c751-45e1-8e0d-65c3ad115bdc	afc667e9-aca2-476a-a6b2-ac9abd4607a1	fbd2da52-50f6-437b-97f8-dc4edbceae1d	7	transition	CUT TO:	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
7628e047-a694-4595-9caf-aeb093ac6a83	afc667e9-aca2-476a-a6b2-ac9abd4607a1	bf2729c9-2009-4a1d-b12f-e8a1f461b358	8	action	This is where action description goes. Describe what the audience sees.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
c28d8341-d610-4a00-a865-5dd895223ac3	afc667e9-aca2-476a-a6b2-ac9abd4607a1	bf2729c9-2009-4a1d-b12f-e8a1f461b358	9	character	CHARACTER NAME	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
8657f4b8-2874-488f-83df-667f077b23e8	afc667e9-aca2-476a-a6b2-ac9abd4607a1	bf2729c9-2009-4a1d-b12f-e8a1f461b358	10	action	This is a sample line of dialogue.	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
e3ada423-be14-4ec0-a496-646c734f8cd5	afc667e9-aca2-476a-a6b2-ac9abd4607a1	bf2729c9-2009-4a1d-b12f-e8a1f461b358	11	parenthetical	(whispering)	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
85503a7f-7fa2-4e5d-8702-ccea281de8ca	055b3e41-4f7d-490f-9b29-128b908c3552	36b7138f-9fc5-4347-a410-a2c5f9098c2b	39	action	This is a sample line of dialogue.	\N	2026-01-07 14:35:49.121667+01	2026-01-15 21:35:49.265731+01
40e1eb77-bfac-4a19-b4b5-de56bca989b2	055b3e41-4f7d-490f-9b29-128b908c3552	a879ffa0-9984-4667-b7d4-87a665fc5b6f	49	action	Hey	\N	2026-01-15 21:39:31.68488+01	2026-01-15 21:39:58.586837+01
\.


--
-- Data for Name: screenplay_scene; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.screenplay_scene (scene_id, screenplay_id, scene_index, slugline, location, time_of_day, is_interior, synopsis, created_at, updated_at) FROM stdin;
689a4f75-a1d4-4d1d-bf59-164311e9377c	689612ea-30fc-418b-882e-51dc2eb9775e	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-05 13:39:39.78589+01	2026-01-05 13:39:39.78589+01
657ab72a-c290-4fa1-8d0f-a96c4b0d17d2	98b90e1e-eae7-418d-984a-af5a91ec2084	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-05 13:41:28.570958+01	2026-01-05 13:41:28.570958+01
26dadae4-8bad-41ae-b5e1-d7a38c9166fc	90368af4-fe7f-4fdb-a85b-62e24abce64f	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-05 13:47:09.229914+01	2026-01-05 13:47:09.229914+01
001bdf48-cf20-412f-9a41-c98ad6236e8a	d88355ec-a569-44cf-bf2b-7582b236fe40	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-05 13:48:17.441076+01	2026-01-05 13:48:17.441076+01
32e420a2-7649-49d7-ac2b-8b4deaac9df5	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-05 13:49:32.500044+01	2026-01-05 13:49:32.500044+01
73b7163d-aea5-4f17-8f04-29a402b72997	aa04df6b-d6a8-4500-8b34-62dcd707649f	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-05 16:12:04.18007+01	2026-01-05 16:12:04.18007+01
bc08bf70-e567-4c8c-a43c-8b3fbe2895c8	65b04657-e10d-4418-9a91-40dd267e79dc	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-05 16:12:34.064023+01	2026-01-05 16:12:34.064023+01
3cd55d4d-bb87-4293-9be0-6f7708eec3fc	c325ec65-87cc-45e5-bbd6-2e3b20f5f697	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-05 16:28:56.906466+01	2026-01-05 16:28:56.906466+01
e3b365f9-7371-430c-bf03-644203777683	a90251c1-d8b0-4a5d-8ba2-7a84f427f86f	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-06 23:10:27.873896+01	2026-01-06 23:10:27.873896+01
8cb61e87-bf36-4319-9a98-482e2d18902a	055b3e41-4f7d-490f-9b29-128b908c3552	1	INT. AIRPORT - DAY	\N	\N	\N	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
292145d3-40db-4016-a9e8-390381ba5991	055b3e41-4f7d-490f-9b29-128b908c3552	2	INT. LOCATION - DAY	\N	\N	\N	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
9f090605-e990-4905-b47b-adf0bbe9020f	055b3e41-4f7d-490f-9b29-128b908c3552	3	INT. LOCATION - DAY	\N	\N	\N	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
6bce87ed-561f-45ad-9d2d-4325c3157f34	055b3e41-4f7d-490f-9b29-128b908c3552	4	INT. LOCATION - DAY	\N	\N	\N	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
97b445cc-184c-4d19-b89b-1d16b52dce0b	055b3e41-4f7d-490f-9b29-128b908c3552	5	INT. LOCATION - DAY	\N	\N	\N	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
80de4ea7-8a44-410d-9256-5941f5a2f95a	055b3e41-4f7d-490f-9b29-128b908c3552	6	INT. LOCATION - DAY	\N	\N	\N	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
36b7138f-9fc5-4347-a410-a2c5f9098c2b	055b3e41-4f7d-490f-9b29-128b908c3552	7	INT. LOCATION - DAY	\N	\N	\N	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
a879ffa0-9984-4667-b7d4-87a665fc5b6f	055b3e41-4f7d-490f-9b29-128b908c3552	8	INT. HOME - DAY	\N	\N	\N	\N	2026-01-07 14:35:49.121667+01	2026-01-07 14:35:49.121667+01
fbd2da52-50f6-437b-97f8-dc4edbceae1d	afc667e9-aca2-476a-a6b2-ac9abd4607a1	1	INT. HOME - DAY	\N	\N	\N	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
bf2729c9-2009-4a1d-b12f-e8a1f461b358	afc667e9-aca2-476a-a6b2-ac9abd4607a1	2	INT. LOCATION - DAY	\N	\N	\N	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
3859cbb9-f5c6-4502-874e-4248a2dfdff5	afc667e9-aca2-476a-a6b2-ac9abd4607a1	3	INT. LOCATION - DAY	\N	\N	\N	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
51f978fc-a78b-414c-9bde-e402a4603bf0	afc667e9-aca2-476a-a6b2-ac9abd4607a1	4	INT. LOCATION - DAY	\N	\N	\N	\N	2026-01-07 15:16:02.150589+01	2026-01-07 15:16:02.150589+01
7987126a-452e-4331-864f-34749fd10a2f	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	1	Scene	\N	\N	\N	\N	2026-01-12 11:51:18.962498+01	2026-01-12 11:51:18.962498+01
190d16ae-1b56-4a75-a278-639e1eec2a31	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	2	INT. LOCATION - DAY	\N	\N	\N	\N	2026-01-12 11:51:18.962498+01	2026-01-12 11:51:18.962498+01
b38e60e5-b261-43a9-89b7-6619be656f30	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	3	Another scene	\N	\N	\N	\N	2026-01-12 11:51:18.962498+01	2026-01-12 11:51:18.962498+01
b998aef1-ce04-4e39-ae20-b685ecfd9d87	6cfa304c-44f8-417b-ab31-d2dd598a5be5	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-15 18:17:11.159007+01	2026-01-15 18:17:11.159007+01
71af1f20-9b1f-4023-a56f-1db6381bde0c	bba1b4ee-c529-4e83-8a4d-5666abd65272	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-15 18:31:25.834292+01	2026-01-15 18:31:25.834292+01
99785031-43a2-4ed8-ac18-c2ef935ca236	81340049-32ce-42cf-854e-3aeb8057ff7d	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-15 18:31:35.216703+01	2026-01-15 18:31:35.216703+01
9ac85e02-b2de-419b-bdee-169932290e31	24795a74-3423-45b1-a761-cf34dcd72a19	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-15 22:22:00.976718+01	2026-01-15 22:22:00.976718+01
cec09529-843c-4863-a527-3b5995e29c19	879985af-785f-46b9-bfb1-b12b0274b469	1	INT. LOCATION - DAY	LOCATION	DAY	t	\N	2026-01-21 12:21:59.857721+01	2026-01-21 12:21:59.857721+01
\.


--
-- Data for Name: screenplay_title; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.screenplay_title (screenplay_id, title, creator_id, visibility, published, genre, tags, format_type, created_at, updated_at, creative_space_id) FROM stdin;
689612ea-30fc-418b-882e-51dc2eb9775e	Test Screenplay	00000000-0000-0000-0000-000000000001	public	t	\N	\N	feature_film	2026-01-05 13:39:39.78589+01	2026-01-05 13:39:39.78589+01	\N
98b90e1e-eae7-418d-984a-af5a91ec2084	UI Test Screenplay	00000000-0000-0000-0000-000000000002	public	t	\N	\N	feature_film	2026-01-05 13:41:28.570958+01	2026-01-05 13:41:28.570958+01	\N
90368af4-fe7f-4fdb-a85b-62e24abce64f	Untitled Screenplay	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	feature_film	2026-01-05 13:47:09.229914+01	2026-01-05 13:47:09.229914+01	\N
d88355ec-a569-44cf-bf2b-7582b236fe40	Untitled Screenplay	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	feature_film	2026-01-05 13:48:17.441076+01	2026-01-05 13:48:17.441076+01	\N
aa04df6b-d6a8-4500-8b34-62dcd707649f	Untitled Screenplay	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	feature_film	2026-01-05 16:12:04.18007+01	2026-01-05 16:12:04.18007+01	\N
65b04657-e10d-4418-9a91-40dd267e79dc	Untitled Screenplay	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	feature_film	2026-01-05 16:12:34.064023+01	2026-01-05 16:12:34.064023+01	\N
c325ec65-87cc-45e5-bbd6-2e3b20f5f697	Untitled Screenplay	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	feature_film	2026-01-05 16:28:56.906466+01	2026-01-05 16:28:56.906466+01	\N
9c50b337-deb8-4501-9e9a-a3ff0323f6bd	Screenplay of an amazing story	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	feature_film	2026-01-05 13:49:32.500044+01	2026-01-06 23:08:21.250522+01	\N
a90251c1-d8b0-4a5d-8ba2-7a84f427f86f	Untitled Screenplay	cad23ca1-121d-448f-8947-ddd5048ecb15	public	t	\N	\N	feature_film	2026-01-06 23:10:27.873896+01	2026-01-06 23:10:27.873896+01	\N
055b3e41-4f7d-490f-9b29-128b908c3552	My amazing screenplay :)	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	feature_film	2026-01-07 12:58:45.418588+01	2026-01-07 14:36:49.820192+01	\N
afc667e9-aca2-476a-a6b2-ac9abd4607a1	Screenplay which was painful	cad23ca1-121d-448f-8947-ddd5048ecb15	public	t	\N	\N	feature_film	2026-01-06 23:24:40.249265+01	2026-01-07 15:16:02.150589+01	\N
6355d67a-d5a9-4ea2-949d-3307cc0c59a9	Developing Crowdly	cad23ca1-121d-448f-8947-ddd5048ecb15	public	t	\N	\N	feature_film	2026-01-12 11:38:51.929089+01	2026-01-12 11:51:18.962498+01	\N
6cfa304c-44f8-417b-ab31-d2dd598a5be5	Untitled Screenplay	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	feature_film	2026-01-15 18:17:11.159007+01	2026-01-15 18:17:11.159007+01	\N
bba1b4ee-c529-4e83-8a4d-5666abd65272	Untitled Screenplay	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	feature_film	2026-01-15 18:31:25.834292+01	2026-01-15 18:31:25.834292+01	\N
81340049-32ce-42cf-854e-3aeb8057ff7d	Untitled Screenplay	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	feature_film	2026-01-15 18:31:35.216703+01	2026-01-15 18:31:35.216703+01	\N
24795a74-3423-45b1-a761-cf34dcd72a19	Untitled Screenplay	cad23ca1-121d-448f-8947-ddd5048ecb15	public	t	\N	\N	feature_film	2026-01-15 22:22:00.976718+01	2026-01-15 22:22:00.976718+01	\N
879985af-785f-46b9-bfb1-b12b0274b469	Untitled Screenplay	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	feature_film	2026-01-21 12:21:59.857721+01	2026-01-21 12:21:59.857721+01	\N
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
520ff5b7-fc08-4c04-bdbb-8de2ad202972	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	And life goes on	{"as always, as it should, it would be rather unusual if it wouldn't, however such a story is also not entirely impossible. :)"}	2025-12-16 18:42:57.147972+01	2025-12-16 18:42:57.147972+01	undecided	\N	\N	\N	4
27c3e162-d103-463d-8a62-862fdf9ae0fb	fb654feb-8547-4c58-8ba6-e11be576b846	Chapter 1 - The day I was conceived/new-story-template	{}	2025-12-14 13:50:53.989809+01	2025-12-14 13:50:53.989809+01	undecided	\N	\N	\N	1
d827937a-cd68-43d1-bf0f-9baf306c08e8	84452f69-b0eb-478e-aa31-938a35ec6912	The day I was conceived	{}	2025-12-14 13:59:32.373146+01	2025-12-14 13:59:32.373146+01	undecided	\N	\N	\N	1
a8197968-c852-40d2-b471-a00fee60c892	7a201a20-c9d7-41ad-8a04-09a4a3bd82bd	The day I was conceived	{Text}	2025-12-14 14:02:52.173353+01	2025-12-14 14:02:52.173353+01	undecided	\N	\N	\N	1
0e0c69e3-157f-4142-b5e8-a8e2d0e26f2e	a6c76f24-d604-4ed2-8b83-74b5640df229	The day I was conceived	{text}	2025-12-14 14:04:07.489924+01	2025-12-14 14:04:07.489924+01	undecided	\N	\N	\N	1
400d2619-93a3-44bc-b5a0-dff34d10040e	751c6c7b-d272-4853-b982-db29b911facc	The day I was conceived	{text}	2025-12-14 14:05:10.181065+01	2025-12-14 14:05:10.181065+01	undecided	\N	\N	\N	1
20c98a0f-5396-47af-982c-c418de96934b	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	The day I was conceived	{"Was a dark and cold one. It was rainy and windy outside - this however is not a problem for two people who are passionately in love."}	2025-12-14 14:05:33.645236+01	2025-12-14 14:05:33.645236+01	undecided	\N	\N	\N	1
8e828011-3bdb-422c-88c6-defa14dedd5e	0bef9edd-18fd-4e1c-aa57-5ef9f8788ba9	The day I was conceived	{dskfskejgksödhagjkdhgjkag}	2025-12-14 14:13:34.526026+01	2025-12-14 14:13:34.526026+01	undecided	\N	\N	\N	1
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
e2bac731-67c3-4955-8d9d-83a8a98574ef	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Kindergarten	{"I do NOT like it. Here are TOO MANY children... and they are noisy.","Let's add something here before sync in the desktop app","Let's add something here on the crowdly web and see if it'll be syn-ed into the\ndesktop app","and now vice versa, if I add something here in the desktop app","and yes, it has worked out.","It is working. Hurray!"}	2025-12-16 19:02:17.755015+01	2025-12-16 19:02:17.755015+01	undecided	\N	\N	\N	6
126491a2-b0e9-4ade-80bb-7ced696abeb2	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	School	{"Good and bad","Friends and enemies","School was somewhat ok, till I became teenager"}	2025-12-16 19:26:24.041234+01	2025-12-16 19:26:24.041234+01	undecided	\N	\N	\N	7
f3fd75b4-7102-4e30-a757-2eb609398ea6	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	College	{"First real life experiences","Let's build that village"}	2025-12-16 19:37:52.220708+01	2025-12-16 19:37:52.220708+01	undecided	\N	\N	\N	8
b9f1de59-0c10-472f-8174-093d351f0e0c	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Test from API 2	{One,Two,Three}	2025-12-16 19:38:53.263346+01	2025-12-16 19:38:53.263346+01	undecided	\N	\N	\N	9
9c50c0af-3cb5-405d-8502-c8d73feeda34	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Test from API 3	{Alpha,Beta}	2025-12-16 19:49:54.264191+01	2025-12-16 19:49:54.264191+01	undecided	\N	\N	\N	10
ba894805-d466-4ed5-b6e6-b276f9bbc232	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Adult life	{"YEAH, YEah, Yeah... yeah... WTH...."}	2025-12-17 14:25:58.743404+01	2025-12-17 14:25:58.743404+01	undecided	\N	\N	\N	11
eb752fad-3eae-458a-97c5-6fa67e389bed	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	When one meest her	{"New text here"}	2025-12-19 11:07:03.489811+01	2025-12-19 11:07:03.489811+01	undecided	\N	\N	\N	12
1028d940-b3ca-4253-b6c3-afd634ff0923	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	It takes a village to raise a child, again	{"indeed so","now it is us who need to find that village","Now I'm adding another paragraph in the desktop app as the user test to see the\nbehaviour of both desktop app and Crowdly web"}	2025-12-23 11:14:13.629506+01	2025-12-23 11:14:13.629506+01	undecided	\N	\N	\N	13
bde622be-157c-49ff-a131-96d02a7e0284	1e6bb2d6-0430-439d-99cf-4616617dfbf8	Intro	{"It is a series of short stories."}	2025-12-29 15:07:39.093126+01	2025-12-29 15:07:39.093126+01	undecided	\N	\N	\N	1
c35dbd92-0686-4036-9b5c-74db0e8cf177	1e6bb2d6-0430-439d-99cf-4616617dfbf8	Chapter 1 - What goes around, comes around	{"Adding couple of words here"}	2025-12-29 15:15:52.628119+01	2025-12-29 15:15:52.628119+01	undecided	\N	\N	\N	2
1988ba43-a32f-4f5b-8698-9fcbc1b10ad7	1e6bb2d6-0430-439d-99cf-4616617dfbf8	Chapter 2 - Bla Bla Blu - is not my song	{"There is a popular female Thai  singer who sings this song"}	2025-12-29 15:16:54.42495+01	2025-12-29 15:16:54.42495+01	undecided	\N	\N	\N	3
f4985aa1-0b7d-4c64-9234-99288c0846b5	10e2ca77-0b5c-4f72-aeee-965cbe4db67a	Intro	{"some intro text"}	2025-12-29 15:22:19.667271+01	2025-12-29 15:22:19.667271+01	undecided	\N	\N	\N	1
0e4ec8f8-acb9-4c5e-be77-cda6021976fa	10e2ca77-0b5c-4f72-aeee-965cbe4db67a	Chapter 1	{"Text of chapter 1"}	2025-12-29 15:23:11.836369+01	2025-12-29 15:23:11.836369+01	undecided	\N	\N	\N	2
988e930d-258c-40e1-aa52-7fa141eb1fb5	10e2ca77-0b5c-4f72-aeee-965cbe4db67a	Chapter 2	{"Text of chapter 2"}	2025-12-29 15:23:11.836369+01	2025-12-29 15:23:11.836369+01	undecided	\N	\N	\N	3
e94a297c-d4e3-417f-b04b-2146b521a668	10e2ca77-0b5c-4f72-aeee-965cbe4db67a	Chapter 3	{"text for chapter 3"}	2025-12-29 15:23:11.836369+01	2025-12-29 15:23:11.836369+01	undecided	\N	\N	\N	4
f23e7e91-9f17-4814-b422-f83188ed8897	6174fd71-525f-40c7-a6e1-3c40f3ea57d5	Intro	{"some intro text"}	2025-12-29 15:42:57.61306+01	2025-12-29 15:42:57.61306+01	undecided	\N	\N	\N	1
8fb7c09e-5e82-471e-ad6d-c566494dcfbf	6174fd71-525f-40c7-a6e1-3c40f3ea57d5	Chapter 1	{"Text of chapter 1"}	2025-12-29 15:43:02.589403+01	2025-12-29 15:43:02.589403+01	undecided	\N	\N	\N	2
e975c6d7-f327-431c-a256-f01e3d77afe3	6174fd71-525f-40c7-a6e1-3c40f3ea57d5	Chapter 2	{"Text of chapter 2"}	2025-12-29 15:43:02.589403+01	2025-12-29 15:43:02.589403+01	undecided	\N	\N	\N	3
0ff85c0d-b0de-4705-96e3-b569b67b0d6a	6174fd71-525f-40c7-a6e1-3c40f3ea57d5	Chapter 3	{"text for chapter 3"}	2025-12-29 15:43:02.589403+01	2025-12-29 15:43:02.589403+01	undecided	\N	\N	\N	4
e4f1826c-eb02-4b2e-917e-0b48f6014840	3adc67d9-ae49-4daa-8a48-67c279e2cdce	Chapter	{""}	2026-01-05 16:12:57.510378+01	2026-01-05 16:12:57.510378+01	undecided	\N	\N	\N	1
9177abd1-cf56-4081-becd-bf1c62705f62	0050799c-61c3-4d49-b255-52da44c9b156	Chapter	{""}	2026-01-05 16:34:01.465666+01	2026-01-05 16:34:01.465666+01	undecided	\N	\N	\N	1
59227da5-e2ad-4008-82ea-cc1926c74a5e	461dd478-6f96-4754-abaa-d033f592da12	Chapter	{""}	2026-01-06 23:22:44.240343+01	2026-01-06 23:22:44.240343+01	undecided	\N	\N	\N	1
5e88d7d5-6610-4e29-99b8-b2eadeab0141	96cb717c-7856-4879-b4a2-30843238c7f5	Initiating thought	{"some paragraph text here"}	2026-01-12 11:37:23.342266+01	2026-01-12 11:37:23.342266+01	undecided	\N	\N	\N	1
38520fb9-77ae-449e-b9cd-5d91c0aef2fd	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	Chapter 1 - Journey into wilderness	{"Some text with some text","Another paragraph with some more text"}	2026-01-15 19:21:47.446813+01	2026-01-15 19:21:47.446813+01	undecided	\N	\N	\N	1
b0b4ad69-a677-4ff5-b9fd-cb89959ac9bb	1e71f053-f465-44ec-94b1-b0fecbd4a773	Chapter	{""}	2026-01-21 12:23:46.104542+01	2026-01-21 12:23:46.104542+01	undecided	\N	\N	\N	1
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
1e6bb2d6-0430-439d-99cf-4616617dfbf8	cad23ca1-121d-448f-8947-ddd5048ecb15	owner	2025-12-29 15:07:39.106397+01
10e2ca77-0b5c-4f72-aeee-965cbe4db67a	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2025-12-29 15:22:19.683308+01
6174fd71-525f-40c7-a6e1-3c40f3ea57d5	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2025-12-29 15:42:57.617218+01
3adc67d9-ae49-4daa-8a48-67c279e2cdce	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-05 16:12:57.522464+01
0050799c-61c3-4d49-b255-52da44c9b156	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-05 16:34:01.479064+01
461dd478-6f96-4754-abaa-d033f592da12	cad23ca1-121d-448f-8947-ddd5048ecb15	owner	2026-01-06 23:22:44.25343+01
96cb717c-7856-4879-b4a2-30843238c7f5	cad23ca1-121d-448f-8947-ddd5048ecb15	owner	2026-01-12 11:37:23.355791+01
902c4c24-a5f2-41d8-85ce-d3b8c95312ba	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-15 19:21:47.483993+01
1e71f053-f465-44ec-94b1-b0fecbd4a773	aef37573-600e-4442-9ae1-63a05799d9a0	owner	2026-01-21 12:23:46.126852+01
\.


--
-- Data for Name: story_attachments; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.story_attachments (id, story_title_id, space_id, item_id, kind, role, created_at, updated_at) FROM stdin;
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
6f542cd0-551b-4ec9-b2b0-61113dd7af2b	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	2025-12-23 12:12:53.237302+01	2025-12-23 12:12:53.237302+01
cad23ca1-121d-448f-8947-ddd5048ecb15	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:11:44.427964+01	2026-01-12 11:44:01.95984+01
aef37573-600e-4442-9ae1-63a05799d9a0	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-19 10:32:07.197304+01	2026-01-15 22:03:37.648236+01
\.


--
-- Data for Name: story_screenplay_links; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.story_screenplay_links (id, story_title_id, screenplay_id, relation_type, created_at) FROM stdin;
\.


--
-- Data for Name: story_spaces; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.story_spaces (id, story_title_id, space_id, role, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: story_title; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.story_title (story_title_id, title, created_at, updated_at, creator_id, visibility, published, genre, tags, creative_space_id) FROM stdin;
d46656f3-b361-4acc-b36a-023bf97707bd	Love story 2	2025-06-15 15:09:53.239137+02	2025-06-15 15:09:53.239137+02	e28cf50b-29ce-4486-b1e6-085882b6dbe9	public	t	\N	\N	\N
c88b45d6-f4ca-4646-b998-2b101e9ea937	Yet another story	2025-06-15 15:15:24.933726+02	2025-06-15 15:15:24.933726+02	e28cf50b-29ce-4486-b1e6-085882b6dbe9	public	t	\N	\N	\N
7c07adb7-deb0-405e-8589-9954cd33edce	Yet another great Story of my LOVE life	2025-06-15 15:26:36.329198+02	2025-06-15 15:26:36.329198+02	e28cf50b-29ce-4486-b1e6-085882b6dbe9	public	t	\N	\N	\N
e0f7de55-1d13-42c1-aecc-e0338ea81152	Story of my life	2025-12-10 12:34:01.715435+01	2025-12-10 12:34:01.715435+01	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	public	t	\N	\N	\N
7b4cb567-de6c-4728-92d7-56a529c9970f	Story of my life (edited)	2025-12-10 13:36:45.724303+01	2025-12-10 13:36:45.724303+01	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	public	t	\N	\N	\N
acab0a30-9f2c-423a-ad82-e86ab2818a01	Test Story	2025-12-10 13:34:38.554488+01	2025-12-10 13:34:38.554488+01	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	public	t	\N	\N	\N
fb654feb-8547-4c58-8ba6-e11be576b846	Story of my life	2025-12-14 13:50:53.989809+01	2025-12-14 13:50:53.989809+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
84452f69-b0eb-478e-aa31-938a35ec6912	Story of my life	2025-12-14 13:59:32.373146+01	2025-12-14 13:59:32.373146+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
7a201a20-c9d7-41ad-8a04-09a4a3bd82bd	Story of my life	2025-12-14 14:02:52.173353+01	2025-12-14 14:02:52.173353+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
a6c76f24-d604-4ed2-8b83-74b5640df229	Story of my life	2025-12-14 14:04:07.489924+01	2025-12-14 14:04:07.489924+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
751c6c7b-d272-4853-b982-db29b911facc	Story of my life	2025-12-14 14:05:10.181065+01	2025-12-14 14:05:10.181065+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
1e6bb2d6-0430-439d-99cf-4616617dfbf8	New day New story	2025-12-29 15:07:39.093126+01	2025-12-29 15:16:54.42495+01	cad23ca1-121d-448f-8947-ddd5048ecb15	public	t	\N	\N	\N
0bef9edd-18fd-4e1c-aa57-5ef9f8788ba9	Story of my life	2025-12-14 14:13:34.526026+01	2025-12-14 14:13:34.526026+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
19065447-aaf0-4e4f-8847-0869de1be7dd	Story of my life	2025-12-14 14:14:40.364576+01	2025-12-14 14:14:40.364576+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
e1ab0869-1759-441e-892d-de376789149b	Story of my life	2025-12-14 14:35:07.685379+01	2025-12-14 14:35:07.685379+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
ab1c8307-21cd-49c3-b236-c05db1eeaa45	Untitled	2025-12-10 14:32:23.583943+01	2025-12-10 14:32:23.583943+01	aef37573-600e-4442-9ae1-63a05799d9a0	private	t	\N	\N	\N
10e2ca77-0b5c-4f72-aeee-965cbe4db67a	New story by Leo Love	2025-12-29 15:22:19.667271+01	2025-12-29 15:41:04.032155+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
6174fd71-525f-40c7-a6e1-3c40f3ea57d5	New story 2 by Leo Love	2025-12-29 15:42:57.61306+01	2025-12-29 15:43:02.589403+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
afc0ca9b-5a67-46a0-b01c-9da9d27ae642	Currently, the most active story	2025-12-14 14:05:33.645236+01	2025-12-29 15:48:06.022141+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
3adc67d9-ae49-4daa-8a48-67c279e2cdce	Untitled	2026-01-05 16:12:57.510378+01	2026-01-05 16:12:57.510378+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
0050799c-61c3-4d49-b255-52da44c9b156	Untitled	2026-01-05 16:34:01.465666+01	2026-01-05 16:34:01.465666+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
461dd478-6f96-4754-abaa-d033f592da12	Untitled	2026-01-06 23:22:44.240343+01	2026-01-06 23:22:44.240343+01	cad23ca1-121d-448f-8947-ddd5048ecb15	public	t	\N	\N	\N
263cffb0-1899-44b9-8e2d-581114963274	Story of my amazing life	2025-12-10 13:54:58.980704+01	2025-12-23 12:14:16.371036+01	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	public	t	\N	\N	\N
96cb717c-7856-4879-b4a2-30843238c7f5	Amazing story of developing Crowdly	2026-01-12 11:37:23.342266+01	2026-01-13 14:40:35.485399+01	cad23ca1-121d-448f-8947-ddd5048ecb15	public	t	\N	\N	\N
902c4c24-a5f2-41d8-85ce-d3b8c95312ba	Title of the story	2026-01-15 19:21:47.446813+01	2026-01-15 22:03:37.648236+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
1e71f053-f465-44ec-94b1-b0fecbd4a773	Untitled	2026-01-21 12:23:46.104542+01	2026-01-21 12:23:46.104542+01	aef37573-600e-4442-9ae1-63a05799d9a0	public	t	\N	\N	\N
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
40e5ae68-f2fa-4c70-8319-a158be8cb4a2	1e6bb2d6-0430-439d-99cf-4616617dfbf8	\N	New day New story	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:07:39.093126+01	Initial creation	en	1
a6a7afcf-a3a7-4197-9b12-3907480e2bad	1e6bb2d6-0430-439d-99cf-4616617dfbf8	New day New story	Untitled	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:11:44.427964+01	Desktop sync	en	2
48b6dbb5-e4b5-4e08-ae16-6a8158f9d981	1e6bb2d6-0430-439d-99cf-4616617dfbf8	Untitled	New day New story	cad23ca1-121d-448f-8947-ddd5048ecb15	2025-12-29 15:15:52.628119+01	Desktop sync	en	3
59f7f5ac-2ab6-4701-9385-2c8a608f9a3c	10e2ca77-0b5c-4f72-aeee-965cbe4db67a	\N	New story by Leo Love	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:22:19.667271+01	Initial creation	en	1
cd238772-d9ef-4702-a2fd-3c7062a74a9b	10e2ca77-0b5c-4f72-aeee-965cbe4db67a	New story by Leo Love	Untitled	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:23:11.836369+01	Desktop sync	en	2
5144144f-a95d-443c-a7ff-042641713956	10e2ca77-0b5c-4f72-aeee-965cbe4db67a	Untitled	New story by Leo Love	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:40:50.235847+01	Desktop sync	en	3
75018316-722b-4bba-b2a5-f65ee74264c6	6174fd71-525f-40c7-a6e1-3c40f3ea57d5	\N	New story by Leo Love	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:42:57.61306+01	Initial creation	en	1
a11e31b0-6ce0-49c3-a112-b8bc5ca159e9	6174fd71-525f-40c7-a6e1-3c40f3ea57d5	New story by Leo Love	New story 2 by Leo Love	aef37573-600e-4442-9ae1-63a05799d9a0	2025-12-29 15:43:02.589403+01	Desktop sync	en	2
9a69e06a-1c0a-4560-8a61-05f6486fb65f	3adc67d9-ae49-4daa-8a48-67c279e2cdce	\N	Untitled	aef37573-600e-4442-9ae1-63a05799d9a0	2026-01-05 16:12:57.510378+01	Initial creation	en	1
9c2f8996-af4b-46bc-9bce-326ec0ecb10e	0050799c-61c3-4d49-b255-52da44c9b156	\N	Untitled	aef37573-600e-4442-9ae1-63a05799d9a0	2026-01-05 16:34:01.465666+01	Initial creation	en	1
48de00e9-564c-4f69-b9a0-d0fbdc6f8214	461dd478-6f96-4754-abaa-d033f592da12	\N	Untitled	cad23ca1-121d-448f-8947-ddd5048ecb15	2026-01-06 23:22:44.240343+01	Initial creation	en	1
415fee42-b20d-4ac6-9bfe-76c307de7184	96cb717c-7856-4879-b4a2-30843238c7f5	\N	Untitled	cad23ca1-121d-448f-8947-ddd5048ecb15	2026-01-12 11:37:23.342266+01	Initial creation	en	1
348241ff-3351-47cb-b3a4-7f12e2a3779a	96cb717c-7856-4879-b4a2-30843238c7f5	Untitled	Amazing story of developing Crowdly	cad23ca1-121d-448f-8947-ddd5048ecb15	2026-01-12 11:44:01.95984+01	Desktop sync	en	2
41d68984-3263-4c9d-8375-0cd6d9ff16f9	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	Title of the story	aef37573-600e-4442-9ae1-63a05799d9a0	2026-01-15 19:21:47.446813+01	Initial creation	en	1
fc16b70b-4484-4feb-87ef-952f815b138d	1e71f053-f465-44ec-94b1-b0fecbd4a773	\N	Untitled	aef37573-600e-4442-9ae1-63a05799d9a0	2026-01-21 12:23:46.104542+01	Initial creation	en	1
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
c07a7e7a-45ee-4a4a-965e-b796347342af	6fe20d11-0118-43b4-8439-ecd9738c8226	consumer
aadae97e-73bd-469d-9197-a5e20d79c5ef	4b0fde23-9891-4c9a-80a0-f41646476bb0	consumer
\.


--
-- Data for Name: user_story_status; Type: TABLE DATA; Schema: public; Owner: lad
--

COPY public.user_story_status (id, user_id, content_type, story_title_id, screenplay_id, is_favorite, is_living, is_lived, created_at, updated_at) FROM stdin;
57957e34-8440-4288-b865-1125722d27cf	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	t	f	f	2026-01-09 15:27:56.583045+01	2026-01-09 15:27:56.583045+01
e549541c-0963-4ab8-8481-d654ad296851	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	t	f	f	2026-01-09 15:28:19.367534+01	2026-01-09 15:28:19.367534+01
b347c1db-ffc6-4167-a94c-0c02e3e04ea7	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-09 17:22:42.818972+01	2026-01-09 17:22:42.818972+01
51b6c14f-e0c4-4caf-9485-557c429ea9dc	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-09 17:25:28.442681+01	2026-01-09 17:25:28.442681+01
f693ce71-3c20-498d-9c3a-aac691258cf2	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-09 17:32:39.735187+01	2026-01-09 17:32:39.735187+01
ea553599-d8c2-4ced-a287-44168bf987e7	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-09 17:32:43.861645+01	2026-01-09 17:32:43.861645+01
37f4fe5e-d8c1-46be-920f-66339ac76ea6	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-09 17:35:22.238002+01	2026-01-09 17:35:22.238002+01
e8c7416f-4b33-4cef-a3db-d5b45155ae83	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-09 17:47:52.896084+01	2026-01-09 17:47:52.896084+01
0927c59b-7175-42b5-ad48-dcbc171a1828	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-09 18:11:42.085076+01	2026-01-09 18:11:42.085076+01
07058892-968e-4b1c-a2a7-a0ca024e96a7	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-09 18:11:45.460171+01	2026-01-09 18:11:45.460171+01
a5c6d13b-3543-4c9d-b968-223047f80db5	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	f	t	f	2026-01-09 18:25:23.437636+01	2026-01-09 18:25:23.437636+01
a5e55778-402a-4021-986c-2ac134642a5e	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	f	t	f	2026-01-09 18:31:22.278043+01	2026-01-09 18:31:22.278043+01
d8b67bc5-2679-473b-b176-a9f70f2029d8	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	f	t	f	2026-01-09 18:36:03.449089+01	2026-01-09 18:36:03.449089+01
67bd0595-1880-4489-bf2d-98b03de0b590	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	f	t	f	2026-01-09 18:36:37.880198+01	2026-01-09 18:36:37.880198+01
7edf99d2-dd93-47d1-9289-b7dc45260829	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	f	t	f	2026-01-09 18:36:42.637938+01	2026-01-09 18:36:42.637938+01
12b92e19-417b-44ec-b593-1d237720d677	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	f	t	f	2026-01-09 18:36:53.060383+01	2026-01-09 18:36:53.060383+01
f40959c4-d8ab-4674-a22a-444754139a08	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	9c50b337-deb8-4501-9e9a-a3ff0323f6bd	f	t	f	2026-01-09 18:37:09.078512+01	2026-01-09 18:37:09.078512+01
c75e09c0-a317-43e3-94e6-549ce76b365c	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-09 22:06:53.555523+01	2026-01-09 22:06:53.555523+01
c3328124-59cf-43a3-83d7-9da9330b2ec3	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	story	96cb717c-7856-4879-b4a2-30843238c7f5	\N	f	t	f	2026-01-12 14:10:09.707256+01	2026-01-12 14:10:09.707256+01
87c21571-589d-427b-ab09-f750accdff81	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	screenplay	\N	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	f	t	f	2026-01-12 14:10:23.239485+01	2026-01-12 14:10:23.239485+01
8b0725c2-4705-4459-9a7c-e58188b6a71a	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	screenplay	\N	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	f	t	f	2026-01-12 15:00:04.592911+01	2026-01-12 15:00:04.592911+01
53e80675-5e67-4ab1-8cce-53c659365ecc	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	screenplay	\N	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	f	t	f	2026-01-12 16:01:54.061635+01	2026-01-12 16:01:54.061635+01
957835db-21cb-4857-91da-c7e237e94308	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	screenplay	\N	6355d67a-d5a9-4ea2-949d-3307cc0c59a9	f	t	f	2026-01-13 10:07:11.617846+01	2026-01-13 10:07:11.617846+01
718752a2-d6c1-457d-b146-ac35b7c92ec9	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-13 12:35:44.132813+01	2026-01-13 12:35:44.132813+01
e0a315be-3cce-48bd-ac1f-41b5f03d698c	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-13 12:36:37.840917+01	2026-01-13 12:36:37.840917+01
d3286ef1-3958-40a6-a50b-53a69bf9ce52	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-13 12:56:28.152066+01	2026-01-13 12:56:28.152066+01
c3357a6a-1f85-4f23-bb4b-7db834fa2d6e	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-13 13:19:04.375369+01	2026-01-13 13:19:04.375369+01
e006611d-ca87-4d3d-89d3-04c959c9568b	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-13 13:19:37.3105+01	2026-01-13 13:19:37.3105+01
96cd1bb0-a0c5-459a-9323-e404d4d78648	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-13 14:00:45.257866+01	2026-01-13 14:00:45.257866+01
a89c1c28-2afd-446d-a8dd-4ffe1e216205	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-13 14:01:20.060211+01	2026-01-13 14:01:20.060211+01
c49dafea-3cc5-467b-b5f6-410fe12fd34c	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-13 14:15:37.741224+01	2026-01-13 14:15:37.741224+01
c469c021-5cb2-4312-9853-8398bdf1f33b	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-13 14:16:23.660309+01	2026-01-13 14:16:23.660309+01
9698c464-6f64-4886-afd9-e22fb19995c1	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-13 14:21:55.790702+01	2026-01-13 14:21:55.790702+01
4b76bef0-ff3a-407b-9391-04b0edc11c8e	cad23ca1-121d-448f-8947-ddd5048ecb15	story	96cb717c-7856-4879-b4a2-30843238c7f5	\N	f	t	f	2026-01-13 14:34:54.519693+01	2026-01-13 14:34:54.519693+01
fdd8fbfe-5c48-4223-9629-bd148f9cbb07	cad23ca1-121d-448f-8947-ddd5048ecb15	story	96cb717c-7856-4879-b4a2-30843238c7f5	\N	f	t	f	2026-01-13 14:39:33.325108+01	2026-01-13 14:39:33.325108+01
2d0e5cf1-de5c-4eaa-b50e-a6dca0450051	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	6cfa304c-44f8-417b-ab31-d2dd598a5be5	f	t	f	2026-01-15 18:17:11.224916+01	2026-01-15 18:17:11.224916+01
3dbdb566-2c29-4386-9b99-64cd86328ede	aef37573-600e-4442-9ae1-63a05799d9a0	story	96cb717c-7856-4879-b4a2-30843238c7f5	\N	f	t	f	2026-01-15 18:52:29.174138+01	2026-01-15 18:52:29.174138+01
1c77f701-ebc8-47d5-a09a-94091ee80ab9	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-15 19:40:37.370508+01	2026-01-15 19:40:37.370508+01
400ac4c1-94a7-49be-afcc-a024efffd565	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-15 20:23:06.467699+01	2026-01-15 20:23:06.467699+01
4a089a14-3622-4905-950d-38e08a3a6839	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-15 20:23:42.75304+01	2026-01-15 20:23:42.75304+01
c56d5a42-c8e5-443a-bfe4-f1ec166773ee	aef37573-600e-4442-9ae1-63a05799d9a0	story	6174fd71-525f-40c7-a6e1-3c40f3ea57d5	\N	f	t	f	2026-01-15 21:02:48.690167+01	2026-01-15 21:02:48.690167+01
5b716965-d5bb-44a0-98c6-5b16d6827673	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-15 21:05:20.304792+01	2026-01-15 21:05:20.304792+01
93dd8b14-096e-480e-9239-7181d05a637b	cad23ca1-121d-448f-8947-ddd5048ecb15	story	751c6c7b-d272-4853-b982-db29b911facc	\N	f	t	f	2026-01-15 21:24:54.531365+01	2026-01-15 21:24:54.531365+01
0490d8a9-3407-42db-91a3-6e7a0cefac7b	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-15 21:38:29.35872+01	2026-01-15 21:38:29.35872+01
de3a7ce1-cb0a-4b6e-bad3-3e9a2e74f6ee	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-15 21:53:57.265163+01	2026-01-15 21:53:57.265163+01
54b09070-4dc0-404d-a906-3fb21b134937	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-15 21:56:48.075858+01	2026-01-15 21:56:48.075858+01
8ac5cd24-5e4e-44eb-a8cf-ee53315a3fca	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-15 22:03:58.309357+01	2026-01-15 22:03:58.309357+01
ec9495d3-257b-4dff-b694-c9951509c8ae	cad23ca1-121d-448f-8947-ddd5048ecb15	story	751c6c7b-d272-4853-b982-db29b911facc	\N	f	t	f	2026-01-15 22:21:48.158316+01	2026-01-15 22:21:48.158316+01
f1af839a-1522-41a2-9fca-2ea20e91a612	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-15 22:28:26.739245+01	2026-01-15 22:28:26.739245+01
f5e1bc19-6e79-4e01-9da3-7046e10c7211	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-15 22:29:02.25455+01	2026-01-15 22:29:02.25455+01
ccbde335-3784-4f4e-9473-3c96d5a2c191	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-15 22:33:40.327166+01	2026-01-15 22:33:40.327166+01
33aa8ca3-5a1a-4f01-8503-96d0d2c708d8	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-15 22:39:46.272905+01	2026-01-15 22:39:46.272905+01
0bb01828-ce6f-4012-ac37-798f5ea0d4e1	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-16 01:25:02.758006+01	2026-01-16 01:25:02.758006+01
bfbb658e-b1ee-4a17-8bfe-2a48e59578fd	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-16 01:25:02.896007+01	2026-01-16 01:25:02.896007+01
5f87788f-f050-4c3a-9fb0-4fcea290bfd3	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-16 01:55:45.69611+01	2026-01-16 01:55:45.69611+01
b77b3578-28ec-4f57-870d-44fa1a66061d	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-16 01:55:46.22008+01	2026-01-16 01:55:46.22008+01
11307ca3-ea4f-4a4f-8c2a-28ea3b9bc2e2	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-16 02:25:46.297903+01	2026-01-16 02:25:46.297903+01
120a2e7f-620d-4a5b-b489-9001e7a82c0a	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-16 02:25:46.475042+01	2026-01-16 02:25:46.475042+01
c7d6f9df-f8d9-4fc7-8ccd-754154b09f04	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-16 08:13:15.50216+01	2026-01-16 08:13:15.50216+01
870c2bcc-0f7c-4067-8fd5-092ccbe80b81	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-16 11:17:53.067695+01	2026-01-16 11:17:53.067695+01
c8307d07-0c1e-46df-8e22-7fb113caed78	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-16 11:17:53.295727+01	2026-01-16 11:17:53.295727+01
a94710d6-f946-4178-bd14-99c66409cdb2	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-16 12:22:55.626406+01	2026-01-16 12:22:55.626406+01
5bd66137-c270-4aaa-990a-778c455000ad	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-16 12:22:55.782053+01	2026-01-16 12:22:55.782053+01
0077ec5b-6207-4e5c-8a27-5e8cd4341c10	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-16 18:47:17.219023+01	2026-01-16 18:47:17.219023+01
cfc7dda2-8845-42a1-b9ec-2d0526446b50	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-16 18:47:17.626733+01	2026-01-16 18:47:17.626733+01
e06b80da-d9e3-4678-afce-8b877f910af3	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-16 21:12:09.12886+01	2026-01-16 21:12:09.12886+01
ae80332a-310c-4d2e-a314-188d5d38c42a	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-16 21:12:15.365264+01	2026-01-16 21:12:15.365264+01
54c774bf-e073-45a7-9a8d-669f3560fb49	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-17 09:54:34.301679+01	2026-01-17 09:54:34.301679+01
9b32f4d1-8b8d-4982-9c30-4459b485915d	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-17 09:54:34.462131+01	2026-01-17 09:54:34.462131+01
9a0bf6bb-adcc-4c19-b878-08cbbd2b8e35	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-17 22:53:08.328955+01	2026-01-17 22:53:08.328955+01
908c6cb3-dbc0-41e9-946a-89c69ae6dacd	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-17 22:53:42.812347+01	2026-01-17 22:53:42.812347+01
371c5321-3ace-4fbf-b179-cdd20b88d47c	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-17 22:54:22.950937+01	2026-01-17 22:54:22.950937+01
068b8626-7c61-44fe-8f8a-ca1fddc0b415	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-17 22:55:17.466102+01	2026-01-17 22:55:17.466102+01
1adfd200-6e4c-4ff4-8e1f-fc1eef95c628	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-17 22:55:34.879904+01	2026-01-17 22:55:34.879904+01
07612af7-454b-4e3e-b67c-8d449997e17e	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-17 23:15:25.076227+01	2026-01-17 23:15:25.076227+01
5a5aac7e-aa37-4988-861c-d89642ba5f74	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-17 23:16:47.839002+01	2026-01-17 23:16:47.839002+01
eb2f0809-395b-45c5-8e59-7264295a58cb	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-17 23:17:25.911865+01	2026-01-17 23:17:25.911865+01
b8f6ebcd-2e59-4c02-b5ff-e9f38f3da82c	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-17 23:17:35.429105+01	2026-01-17 23:17:35.429105+01
0cc8c9dd-242b-4bae-8030-332f58ff1cfa	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-17 23:18:07.757753+01	2026-01-17 23:18:07.757753+01
037f8a3d-c9d7-46c5-8b45-8d2abcb7c286	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-18 08:35:32.110412+01	2026-01-18 08:35:32.110412+01
5aae75d5-a9bf-44d2-9d6e-c032663d9b9a	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-18 08:41:46.840896+01	2026-01-18 08:41:46.840896+01
cb8c86ab-f289-48ea-87c4-c05625ac616b	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-18 08:51:24.930525+01	2026-01-18 08:51:24.930525+01
79cc3d89-8edb-4a82-9b35-b7cf8b75791f	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-18 09:20:35.506661+01	2026-01-18 09:20:35.506661+01
807ab734-9a06-405a-ae5d-a65d319c8180	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-18 11:19:51.822321+01	2026-01-18 11:19:51.822321+01
cc12bc1f-d091-4a66-bdad-43d623133fb1	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	story	96cb717c-7856-4879-b4a2-30843238c7f5	\N	f	t	f	2026-01-19 21:56:42.320051+01	2026-01-19 21:56:42.320051+01
c9e7aab4-201b-4cf3-989a-6cc4000ef151	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	story	96cb717c-7856-4879-b4a2-30843238c7f5	\N	f	t	f	2026-01-20 09:04:48.444763+01	2026-01-20 09:04:48.444763+01
c149e8cc-74b8-47a1-a28d-c9c11518a3c3	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-20 18:46:09.723464+01	2026-01-20 18:46:09.723464+01
bb89484a-a81d-4622-a039-bb2cb3e5bdbb	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-21 10:06:19.062059+01	2026-01-21 10:06:19.062059+01
a84e319c-23d7-4742-a676-6caca204472d	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-22 13:50:34.702926+01	2026-01-22 13:50:34.702926+01
d97415f2-0218-4239-a31f-4f0eaf140185	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-22 21:05:07.797786+01	2026-01-22 21:05:07.797786+01
9b755a4e-93ef-4ab1-95cd-def0fe9dfcf5	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-23 09:42:56.959887+01	2026-01-23 09:42:56.959887+01
b8080ce7-ce99-4afc-9c36-bb0faf610b61	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-23 11:07:48.092396+01	2026-01-23 11:07:48.092396+01
93c6940f-f196-49f7-a4fa-59ef6e0f94a2	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-23 12:59:47.392214+01	2026-01-23 12:59:47.392214+01
982c0c39-3f6a-476d-a1e4-157b5eff2869	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-23 14:58:40.051529+01	2026-01-23 14:58:40.051529+01
2c440a6a-1710-4152-b031-b3f9efc0de8c	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-23 17:57:33.659165+01	2026-01-23 17:57:33.659165+01
d1392df4-9355-40d9-897c-de0795aa8e3c	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-23 21:41:48.613342+01	2026-01-23 21:41:48.613342+01
d347c6ee-2f41-40c2-9a0f-c819b6a9dc1e	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-24 11:16:02.607075+01	2026-01-24 11:16:02.607075+01
db4f01f0-505b-4a9e-a7f2-9c984f161116	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-24 15:09:58.779423+01	2026-01-24 15:09:58.779423+01
975bc277-6555-49c6-b64b-12906690ab44	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-24 16:02:17.675365+01	2026-01-24 16:02:17.675365+01
2a7c6a7d-b7af-4e14-a6d4-efd626ce8fab	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-25 10:34:13.114284+01	2026-01-25 10:34:13.114284+01
57920d18-11ad-4c7e-aadb-865d4e8c16cd	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-25 13:54:39.590388+01	2026-01-25 13:54:39.590388+01
d472fde6-fbd5-4483-ab11-bdf6dd515201	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-26 10:19:36.365696+01	2026-01-26 10:19:36.365696+01
3ec9438b-61bd-4f4d-befc-004af858a74f	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-27 12:30:59.214501+01	2026-01-27 12:30:59.214501+01
a2618ace-8d1b-4497-b026-cfd1355d1b50	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-27 15:45:10.624911+01	2026-01-27 15:45:10.624911+01
6f1e5c72-b11d-4349-a3dc-abb2976ad24c	aef37573-600e-4442-9ae1-63a05799d9a0	story	902c4c24-a5f2-41d8-85ce-d3b8c95312ba	\N	f	t	f	2026-01-28 12:39:48.929588+01	2026-01-28 12:39:48.929588+01
a8fc8291-c49d-480b-8fad-6fc9ad3b158f	aef37573-600e-4442-9ae1-63a05799d9a0	story	96cb717c-7856-4879-b4a2-30843238c7f5	\N	f	t	f	2026-01-30 07:52:32.451652+01	2026-01-30 07:52:32.451652+01
65efed92-f4e9-4f99-add8-2a078d1d1dc7	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-30 07:53:21.740694+01	2026-01-30 07:53:21.740694+01
9779d483-ddf1-4b2a-b7e3-f16f0c38ec18	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-30 07:58:36.267211+01	2026-01-30 07:58:36.267211+01
29672416-9584-4d89-b1fe-0fc93d9810e5	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-01-30 07:58:57.988036+01	2026-01-30 07:58:57.988036+01
1b53e433-ac84-4744-87b9-ab53fed12baf	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-01-30 08:02:02.951003+01	2026-01-30 08:02:02.951003+01
6ec73cf9-325c-4c6b-b3e8-8dec1914b05f	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-07 13:02:00.499651+01	2026-02-07 13:02:00.499651+01
4dba37ea-0b9f-4e5f-997e-aa6e7e8610f5	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-07 13:06:56.650429+01	2026-02-07 13:06:56.650429+01
26da34c2-8f5f-4146-9901-4ad4caa09a19	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-02-07 14:56:47.488892+01	2026-02-07 14:56:47.488892+01
b43e4781-13ca-400d-b0e9-9e631996bf3d	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-07 22:18:13.042659+01	2026-02-07 22:18:13.042659+01
fc5d5c6d-ef7d-499b-88d3-86bdcb233d5d	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-07 22:18:16.901536+01	2026-02-07 22:18:16.901536+01
416991fe-c140-4a27-8586-3d3fc34b4e5d	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-07 22:18:19.28358+01	2026-02-07 22:18:19.28358+01
8feb0e71-4e57-4b62-a55f-af44dafbf6cf	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-07 22:22:53.888679+01	2026-02-07 22:22:53.888679+01
66f726e1-2378-47df-a2a6-706ddd4fd865	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-07 22:22:58.325485+01	2026-02-07 22:22:58.325485+01
46b9d308-eba0-446b-b83c-1a25b46a7ce9	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-07 22:23:00.070177+01	2026-02-07 22:23:00.070177+01
9c9e01ac-76e9-42be-9e0a-a51e05f1f68e	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-02-07 22:24:44.241935+01	2026-02-07 22:24:44.241935+01
f27c6dd8-2a75-4159-895a-f2d2e9f47716	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-07 22:25:40.79074+01	2026-02-07 22:25:40.79074+01
4c25d18b-b954-4f80-abcc-4e34b41afbf4	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-07 22:27:50.150602+01	2026-02-07 22:27:50.150602+01
65a6a979-1883-43c6-bd20-df66a7a73f30	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-07 22:28:07.614799+01	2026-02-07 22:28:07.614799+01
506bd362-9895-426a-bf1f-80013cbdebe9	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-08 12:12:54.309874+01	2026-02-08 12:12:54.309874+01
736e6922-02e6-4710-bc77-c2e1a9187a33	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-08 12:55:42.560702+01	2026-02-08 12:55:42.560702+01
c340aa37-300d-4e10-8cf3-294655523426	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-08 12:56:10.882839+01	2026-02-08 12:56:10.882839+01
cd387ce9-3c49-4405-b341-c8ab31d8deee	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-08 12:56:14.789356+01	2026-02-08 12:56:14.789356+01
32937ad2-ae0c-4ca1-af0d-c3f8a7ec1096	aef37573-600e-4442-9ae1-63a05799d9a0	story	afc0ca9b-5a67-46a0-b01c-9da9d27ae642	\N	f	t	f	2026-02-08 12:57:39.882173+01	2026-02-08 12:57:39.882173+01
82a95262-8211-4ce0-a8c7-d3ab6ba88bf9	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-02-08 12:58:25.668866+01	2026-02-08 12:58:25.668866+01
e5f8ae2d-093d-4070-a121-a6d144824266	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-02-08 14:14:00.622973+01	2026-02-08 14:14:00.622973+01
d5f2ccd1-f070-4145-b48d-465f1a1b2fe0	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-02-08 14:14:08.835629+01	2026-02-08 14:14:08.835629+01
9d0fd037-3f7f-4698-af7c-8cec948695ee	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-02-08 14:14:16.306129+01	2026-02-08 14:14:16.306129+01
7cf3dee7-e8a2-4cbd-a5f4-f2fd45ceacd3	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-02-08 14:14:20.398665+01	2026-02-08 14:14:20.398665+01
0f1cbc85-385b-4d4d-a22a-090d62edee53	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-02-08 14:14:45.474616+01	2026-02-08 14:14:45.474616+01
8c53cefc-69f7-4e37-9a4d-c4e8b245564d	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-02-08 14:14:54.270687+01	2026-02-08 14:14:54.270687+01
8b3dd037-cbbf-4cd5-bb7d-e44fd045ec7c	aef37573-600e-4442-9ae1-63a05799d9a0	screenplay	\N	055b3e41-4f7d-490f-9b29-128b908c3552	f	t	f	2026-02-08 14:27:43.992448+01	2026-02-08 14:27:43.992448+01
2a7fe0b3-5b9e-4e3a-84b2-3f53e885b03c	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	story	7b4cb567-de6c-4728-92d7-56a529c9970f	\N	f	t	f	2026-02-11 19:17:26.942426+01	2026-02-11 19:17:26.942426+01
6bad5b67-6ae1-46e2-9d0a-494dce9e5327	6f542cd0-551b-4ec9-b2b0-61113dd7af2b	story	7b4cb567-de6c-4728-92d7-56a529c9970f	\N	f	t	f	2026-02-11 21:02:47.302847+01	2026-02-11 21:02:47.302847+01
\.


--
-- Name: crdt_changes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: lad
--

SELECT pg_catalog.setval('public.crdt_changes_id_seq', 1, false);


--
-- Name: alpha_applications alpha_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.alpha_applications
    ADD CONSTRAINT alpha_applications_pkey PRIMARY KEY (id);


--
-- Name: alpha_invitations alpha_invitations_email_key; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.alpha_invitations
    ADD CONSTRAINT alpha_invitations_email_key UNIQUE (email);


--
-- Name: alpha_invitations alpha_invitations_invitation_code_key; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.alpha_invitations
    ADD CONSTRAINT alpha_invitations_invitation_code_key UNIQUE (invitation_code);


--
-- Name: alpha_invitations alpha_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.alpha_invitations
    ADD CONSTRAINT alpha_invitations_pkey PRIMARY KEY (id);


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
-- Name: creative_space_items creative_space_items_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.creative_space_items
    ADD CONSTRAINT creative_space_items_pkey PRIMARY KEY (id);


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
-- Name: locales locales_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.locales
    ADD CONSTRAINT locales_pkey PRIMARY KEY (code);


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
-- Name: screenplay_access screenplay_access_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.screenplay_access
    ADD CONSTRAINT screenplay_access_pkey PRIMARY KEY (screenplay_id, user_id);


--
-- Name: screenplay_block screenplay_block_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.screenplay_block
    ADD CONSTRAINT screenplay_block_pkey PRIMARY KEY (block_id);


--
-- Name: screenplay_scene screenplay_scene_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.screenplay_scene
    ADD CONSTRAINT screenplay_scene_pkey PRIMARY KEY (scene_id);


--
-- Name: screenplay_title screenplay_title_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.screenplay_title
    ADD CONSTRAINT screenplay_title_pkey PRIMARY KEY (screenplay_id);


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
-- Name: story_attachments story_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_attachments
    ADD CONSTRAINT story_attachments_pkey PRIMARY KEY (id);


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
-- Name: story_screenplay_links story_screenplay_links_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_screenplay_links
    ADD CONSTRAINT story_screenplay_links_pkey PRIMARY KEY (id);


--
-- Name: story_spaces story_spaces_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_spaces
    ADD CONSTRAINT story_spaces_pkey PRIMARY KEY (id);


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
-- Name: user_story_status user_story_status_pkey; Type: CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.user_story_status
    ADD CONSTRAINT user_story_status_pkey PRIMARY KEY (id);


--
-- Name: comments_screenplay_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX comments_screenplay_idx ON public.comments USING btree (screenplay_id);


--
-- Name: comments_screenplay_scene_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX comments_screenplay_scene_idx ON public.comments USING btree (screenplay_scene_id);


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
-- Name: creative_space_items_space_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX creative_space_items_space_idx ON public.creative_space_items USING btree (space_id);


--
-- Name: creative_space_items_space_path_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE UNIQUE INDEX creative_space_items_space_path_idx ON public.creative_space_items USING btree (space_id, relative_path);


--
-- Name: creative_space_items_space_updated_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX creative_space_items_space_updated_idx ON public.creative_space_items USING btree (space_id, updated_at);


--
-- Name: creative_spaces_user_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX creative_spaces_user_idx ON public.creative_spaces USING btree (user_id);


--
-- Name: idx_stories_story_title_id; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX idx_stories_story_title_id ON public.stories USING btree (story_title_id);


--
-- Name: reactions_screenplay_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX reactions_screenplay_idx ON public.reactions USING btree (screenplay_id);


--
-- Name: reactions_screenplay_scene_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX reactions_screenplay_scene_idx ON public.reactions USING btree (screenplay_scene_id);


--
-- Name: screenplay_access_user_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX screenplay_access_user_idx ON public.screenplay_access USING btree (user_id);


--
-- Name: screenplay_block_screenplay_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX screenplay_block_screenplay_idx ON public.screenplay_block USING btree (screenplay_id, block_index);


--
-- Name: screenplay_scene_screenplay_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX screenplay_scene_screenplay_idx ON public.screenplay_scene USING btree (screenplay_id, scene_index);


--
-- Name: screenplay_title_space_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX screenplay_title_space_idx ON public.screenplay_title USING btree (creative_space_id);


--
-- Name: story_attachments_space_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX story_attachments_space_idx ON public.story_attachments USING btree (space_id);


--
-- Name: story_attachments_story_item_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE UNIQUE INDEX story_attachments_story_item_idx ON public.story_attachments USING btree (story_title_id, item_id);


--
-- Name: story_screenplay_unique; Type: INDEX; Schema: public; Owner: lad
--

CREATE UNIQUE INDEX story_screenplay_unique ON public.story_screenplay_links USING btree (story_title_id, screenplay_id, relation_type);


--
-- Name: story_spaces_space_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX story_spaces_space_idx ON public.story_spaces USING btree (space_id);


--
-- Name: story_spaces_story_space_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE UNIQUE INDEX story_spaces_story_space_idx ON public.story_spaces USING btree (story_title_id, space_id);


--
-- Name: story_title_space_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX story_title_space_idx ON public.story_title USING btree (creative_space_id);


--
-- Name: user_story_status_unique; Type: INDEX; Schema: public; Owner: lad
--

CREATE UNIQUE INDEX user_story_status_unique ON public.user_story_status USING btree (user_id, content_type, story_title_id, screenplay_id);


--
-- Name: user_story_status_user_idx; Type: INDEX; Schema: public; Owner: lad
--

CREATE INDEX user_story_status_user_idx ON public.user_story_status USING btree (user_id, content_type);


--
-- Name: alpha_applications alpha_applications_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.alpha_applications
    ADD CONSTRAINT alpha_applications_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.local_users(id) ON DELETE SET NULL;


--
-- Name: alpha_invitations alpha_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.alpha_invitations
    ADD CONSTRAINT alpha_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.local_users(id) ON DELETE SET NULL;


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
-- Name: comments comments_screenplay_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_screenplay_scene_id_fkey FOREIGN KEY (screenplay_scene_id) REFERENCES public.screenplay_scene(scene_id) ON DELETE CASCADE;


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
-- Name: creative_space_items creative_space_items_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.creative_space_items
    ADD CONSTRAINT creative_space_items_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.creative_spaces(id) ON DELETE CASCADE;


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
-- Name: screenplay_access screenplay_access_screenplay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.screenplay_access
    ADD CONSTRAINT screenplay_access_screenplay_id_fkey FOREIGN KEY (screenplay_id) REFERENCES public.screenplay_title(screenplay_id) ON DELETE CASCADE;


--
-- Name: screenplay_block screenplay_block_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.screenplay_block
    ADD CONSTRAINT screenplay_block_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.screenplay_scene(scene_id) ON DELETE CASCADE;


--
-- Name: screenplay_block screenplay_block_screenplay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.screenplay_block
    ADD CONSTRAINT screenplay_block_screenplay_id_fkey FOREIGN KEY (screenplay_id) REFERENCES public.screenplay_title(screenplay_id) ON DELETE CASCADE;


--
-- Name: screenplay_scene screenplay_scene_screenplay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.screenplay_scene
    ADD CONSTRAINT screenplay_scene_screenplay_id_fkey FOREIGN KEY (screenplay_id) REFERENCES public.screenplay_title(screenplay_id) ON DELETE CASCADE;


--
-- Name: screenplay_title screenplay_title_creative_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.screenplay_title
    ADD CONSTRAINT screenplay_title_creative_space_id_fkey FOREIGN KEY (creative_space_id) REFERENCES public.creative_spaces(id) ON DELETE SET NULL;


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
-- Name: story_attachments story_attachments_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_attachments
    ADD CONSTRAINT story_attachments_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.creative_space_items(id) ON DELETE CASCADE;


--
-- Name: story_attachments story_attachments_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_attachments
    ADD CONSTRAINT story_attachments_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.creative_spaces(id) ON DELETE CASCADE;


--
-- Name: story_attachments story_attachments_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_attachments
    ADD CONSTRAINT story_attachments_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


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
-- Name: story_screenplay_links story_screenplay_links_screenplay_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_screenplay_links
    ADD CONSTRAINT story_screenplay_links_screenplay_id_fkey FOREIGN KEY (screenplay_id) REFERENCES public.screenplay_title(screenplay_id) ON DELETE CASCADE;


--
-- Name: story_screenplay_links story_screenplay_links_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_screenplay_links
    ADD CONSTRAINT story_screenplay_links_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


--
-- Name: story_spaces story_spaces_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_spaces
    ADD CONSTRAINT story_spaces_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.creative_spaces(id) ON DELETE CASCADE;


--
-- Name: story_spaces story_spaces_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_spaces
    ADD CONSTRAINT story_spaces_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


--
-- Name: story_title story_title_creative_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_title
    ADD CONSTRAINT story_title_creative_space_id_fkey FOREIGN KEY (creative_space_id) REFERENCES public.creative_spaces(id) ON DELETE SET NULL;


--
-- Name: story_title_revisions story_title_revisions_story_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: lad
--

ALTER TABLE ONLY public.story_title_revisions
    ADD CONSTRAINT story_title_revisions_story_title_id_fkey FOREIGN KEY (story_title_id) REFERENCES public.story_title(story_title_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict kTkdeLm5e0EFNLeh2UuVtNARKl2xwOSgHnSs2NcdbOlybire0YHROLN2Hq4MFaP

