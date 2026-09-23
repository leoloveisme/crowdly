import React from "react";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";

interface AboutSection {
  id: string;
  number: string;
  title: string;
  paragraphs: string[];
  callout?: string;
  status?: string;
}

const SECTIONS: AboutSection[] = [
  {
    id: "what",
    number: "01",
    title: "What Crowdly is",
    paragraphs: [
      "Crowdly is a platform for creating, experiencing and evolving stories together. We're bringing storytelling, entertainment and community into one place, with room for both individual voices and shared imagination.",
      "The vision reaches across text, illustrations, audio and video, and eventually into immersive experiences. A written scene might inspire an illustration; an illustration might suggest a new character; a voice might give that character a life of their own. Different forms of expression can become different ways into the same world.",
      "Come for something to read, watch or listen to. Stay for the people and possibilities you discover. And if an idea takes hold, there should be a natural path from enjoying a story to creating something yourself.",
    ],
  },
  {
    id: "why",
    number: "02",
    title: "Why it exists",
    paragraphs: [
      "Stories stay with us after the final page or closing scene. We wonder what happened next, imagine a different choice, or find ourselves more interested in a supporting character than the hero. That curiosity is a starting point for creativity.",
      "Crowdly exists to give it somewhere to go. We want to make it easier to develop an idea, share it and find people who see possibilities in it too. A conversation about a story can become the beginning of another story.",
      "That means making creative tools approachable. You should be able to begin with a thought and a blank page, then find more depth as your project grows. The ambition is to spend less energy managing the process and more energy making something that matters to you.",
    ],
  },
  {
    id: "branches",
    number: "03",
    title: "Stories don't have to have only one version",
    paragraphs: [
      "Imagine a character standing at a crossroads. In one telling, they go home. In another, they open the letter they've been carrying for years. Both choices could lead somewhere worth exploring.",
      "Branching is central to Crowdly's vision: a story can take a new direction without erasing the one that came before it. A branch might continue an unfinished adventure, follow another character or ask what would happen if a single decision changed. Someone else might then find a new possibility in that branch.",
      "Versioning brings another kind of freedom: room to develop a telling over time. Together, versions and branches offer a way to think about stories as living creative work, with a history and more than one possible future.",
    ],
    callout: "An ending can be satisfying. It can also be an invitation.",
  },
  {
    id: "participation",
    number: "04",
    title: "Creating and experiencing are two sides of the same platform",
    paragraphs: [
      "Some days you want to make something. Other days you want to get lost in something someone else has made. Crowdly is being shaped around both experiences, and the connections between them.",
      "For creators, the aim is a welcoming place to develop work, explore alternatives and share it with an audience. For readers, listeners and viewers, it's a place to discover worlds, follow the versions that interest them and join the conversation around them.",
      "You don't need to become a creator to belong. Enjoying a story is enough. But a thoughtful response, a question or an unexpected interpretation can mean a great deal to the person making it. We want those encounters to feel like a natural part of the experience.",
    ],
  },
  {
    id: "ai",
    number: "05",
    title: "AI is an assistant, not the point",
    paragraphs: [
      "The point of Crowdly is what people imagine, create and enjoy together. AI assistance belongs in that picture when it helps someone express an idea, and its use is optional.",
      "Our approach is to let you decide whether assistance belongs in your process. You might want help considering alternatives or working through a rough idea. You might prefer to shape every sentence and detail yourself. Both approaches should feel at home here.",
      "The creative decisions remain yours: what you want to say, what feels right and what deserves to be shared. The value of a story comes from the experience it offers and the connection it makes.",
    ],
  },
  {
    id: "future",
    number: "06",
    title: "Where Crowdly is today and where it is going",
    status: "In development · Alpha stage",
    paragraphs: [
      "Crowdly is still taking shape. The project is in its alpha stage, and the full experience described here is the direction we're building toward. There is meaningful work ahead across the platform and its apps.",
      "For the creation experience, we're drawing inspiration from the focus and depth of tools such as Scrivener and Ulysses. Our goal is to make substantial writing projects easier to handle, with less complexity around preparing and bringing the work together.",
      "The longer-term vision connects those creation tools with branching stories, community discussion and more ways to experience a world across different media. We want each step to make Crowdly more useful for the people creating and enjoying stories now, while opening possibilities for what comes next.",
      "If that future interests you, explore Crowdly or follow the project as it develops. There is still much to build, and plenty of room for imagination.",
    ],
  },
];

const TOC: { id: string; label: string }[] = [
  { id: "what", label: "What Crowdly is" },
  { id: "why", label: "Why it exists" },
  { id: "branches", label: "More than one version" },
  { id: "participation", label: "Creating and experiencing" },
  { id: "ai", label: "AI as an assistant" },
  { id: "future", label: "Today and tomorrow" },
];

const linkClass =
  "text-indigo-600 dark:text-indigo-300 underline underline-offset-4 hover:text-pink-600 dark:hover:text-pink-300 hover:decoration-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 rounded-sm";

const AboutUs = () => {
  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-pink-50/60 via-white to-indigo-50/60 dark:from-background dark:via-background dark:to-background text-[#1A1F2C] dark:text-gray-100">
      <CrowdlyHeader />

      <main className="flex-grow w-full max-w-4xl mx-auto px-4 text-[17px] md:text-lg leading-[1.75]">
        <div className="pt-10 pb-8 md:pt-16 md:pb-12">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-600 dark:text-gray-300">
            <EditableText id="about-hero-label">Every single story has more possibilities</EditableText>
          </p>
          <h1 className="max-w-[850px] mt-5 mb-7 text-4xl md:text-6xl font-semibold leading-[1.15] tracking-tight text-balance bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 dark:from-indigo-200 dark:via-pink-300 dark:to-indigo-300 bg-clip-text text-transparent">
            <EditableText id="about-hero-title">
              Entertainment doesn't have to end where its creator ended it.
            </EditableText>
          </h1>
          <p className="max-w-[660px] mb-5 text-xl text-gray-600 dark:text-gray-300">
            <EditableText id="about-hero-intro">
              Another ending. An unexpected perspective. A world you want to spend more time in. Crowdly begins with a simple question: what could a story become if more people could help it grow?
            </EditableText>
          </p>
          <p className="mt-8 mb-5 text-[22px] font-semibold text-indigo-600 dark:text-indigo-300">
            <EditableText id="about-tagline">where your entertainment (l)i(ve)s</EditableText>
          </p>
          <p className="text-[15px] text-gray-600 dark:text-gray-300">
            <EditableText id="about-meaning-1">Where your entertainment</EditableText>{" "}
            <strong><EditableText id="about-meaning-lives">lives</EditableText></strong>
            {". "}
            <EditableText id="about-meaning-2">Where your entertainment</EditableText>{" "}
            <strong><EditableText id="about-meaning-is">is</EditableText></strong>
            {"."}
          </p>
        </div>

        <nav
          aria-label="On this page"
          className="border-y border-indigo-100 dark:border-indigo-900/60 py-6"
        >
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2 m-0 pl-6 list-decimal text-[15px] marker:text-indigo-400">
            {TOC.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} onClick={(e) => scrollTo(e, item.id)} className={linkClass}>
                  <EditableText id={`about-toc-${item.id}`}>{item.label}</EditableText>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="grid grid-cols-1 md:grid-cols-[64px_1fr] gap-3 md:gap-6 py-9 md:py-12 border-b border-indigo-100 dark:border-indigo-900/60 last:border-b-0 scroll-mt-6"
          >
            <span aria-hidden="true" className="pt-1.5 text-sm font-bold text-pink-600 dark:text-pink-300">
              {section.number} /
            </span>
            <div className="max-w-[710px]">
              {section.status && (
                <span className="inline-block mb-4 px-3 py-1 rounded-full bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200 text-[13px] font-semibold leading-normal">
                  <EditableText id={`about-${section.id}-status`}>{section.status}</EditableText>
                </span>
              )}
              <h2
                id={`${section.id}-heading`}
                className="mb-6 text-[27px] md:text-4xl font-semibold leading-[1.15] tracking-tight text-balance text-indigo-950 dark:text-indigo-100"
              >
                <EditableText id={`about-${section.id}-title`}>{section.title}</EditableText>
              </h2>
              {section.paragraphs.map((text, i) => (
                <p key={i} className="mb-5 last:mb-0">
                  <EditableText id={`about-${section.id}-p${i + 1}`}>{text}</EditableText>
                </p>
              ))}
              {section.callout && (
                <p className="border-l-4 border-pink-400 pl-5 text-[22px] text-indigo-700 dark:text-indigo-300">
                  <EditableText id={`about-${section.id}-callout`}>{section.callout}</EditableText>
                </p>
              )}
            </div>
          </section>
        ))}
      </main>

      <CrowdlyFooter />
    </div>
  );
};

export default AboutUs;
