export type Tool = {
  name: string;
  description: string;
  githubUrl: string;
  websiteUrl?: string;
  category: 'AI' | 'Audio' | 'Documents' | 'Games' | 'Images' | 'Productivity' | 'Text' | 'Web' | 'Developer';
};

export const tools: Tool[] = [
  {
    name: 'agenda-flow',
    description: 'Turns Confluence meeting pages into structured, timeboxed agendas with a meeting timer.',
    githubUrl: 'https://github.com/atlesque/agenda-flow',
    category: 'Productivity',
  },
  {
    name: 'among-us-detective',
    description: 'Helper for tracking suspects, tasks, and observations while playing Among Us.',
    githubUrl: 'https://github.com/atlesque/among-us-detective',
    websiteUrl: 'https://amongusdetective.com/',
    category: 'Games',
  },
  {
    name: 'atlesque-rng',
    description: 'Configurable random number generator with min/max and auto-generate interval.',
    githubUrl: 'https://github.com/atlesque/atlesque-rng',
    category: 'Productivity',
  },
  {
    name: 'audio-blind-test',
    description: 'Blind audio comparison and rating app with ranked results export.',
    githubUrl: 'https://github.com/atlesque/audio-blind-test',
    category: 'Audio',
  },
  {
    name: 'copilot-hooks',
    description: 'VS Code Copilot hook scripts that send ntfy notifications for agent/tool events.',
    githubUrl: 'https://github.com/atlesque/copilot-hooks',
    category: 'Developer',
  },
  {
    name: 'csv-parser',
    description: 'Client-side CSV parser with a React UI.',
    githubUrl: 'https://github.com/atlesque/csv-parser',
    category: 'Developer',
  },
  {
    name: 'deepseek-peak-hours',
    description: 'Shows when it is peak hours for using the DeepSeek API.',
    githubUrl: 'https://github.com/atlesque/deepseek-peak-hours',
    category: 'AI',
  },
  {
    name: 'doc-translator',
    description: 'Translates .txt documents using DeepSeek AI, with progress and retry handling.',
    githubUrl: 'https://github.com/atlesque/doc-translator',
    category: 'Documents',
  },
  {
    name: 'docx-viewer',
    description: 'Client-side .docx Word document viewer.',
    githubUrl: 'https://github.com/atlesque/docx-viewer',
    category: 'Documents',
  },
  {
    name: 'image-detective',
    description: 'Drag-and-drop image viewer and metadata/EXIF inspector.',
    githubUrl: 'https://github.com/atlesque/image-detective',
    category: 'Images',
  },
  {
    name: 'image-slider',
    description: 'WordPress plugin for an ACF/Flickity Gutenberg image slider block.',
    githubUrl: 'https://github.com/atlesque/image-slider',
    category: 'Web',
  },
  {
    name: 'instagram-cropper',
    description: 'Resizes images to Instagram ratios and adds background when needed.',
    githubUrl: 'https://github.com/atlesque/instagram-cropper',
    category: 'Images',
  },
  {
    name: 'jira-git-branch-namer',
    description: "Chrome extension that rewrites Jira's git branch checkout command.",
    githubUrl: 'https://github.com/atlesque/jira-git-branch-namer',
    category: 'Developer',
  },
  {
    name: 'jpg-to-transparent-png-converter',
    description: 'Converts near-white pixels in JPG images to transparency in a PNG/canvas workflow.',
    githubUrl: 'https://github.com/atlesque/jpg-to-transparent-png-converter',
    category: 'Images',
  },
  {
    name: 'json-editor',
    description: 'Simple JSON editor built with Vue 3 and Vite.',
    githubUrl: 'https://github.com/atlesque/json-editor',
    category: 'Developer',
  },
  {
    name: 'mbp-kleuren-contactvoorkeuren',
    description: 'Overview/reference tool for Contactvoorkeuren colors.',
    githubUrl: 'https://github.com/atlesque/mbp-kleuren-contactvoorkeuren',
    category: 'Productivity',
  },
  {
    name: 'midi-visualizer',
    description: 'Drag-and-drop MIDI piano-roll visualizer with playback controls.',
    githubUrl: 'https://github.com/atlesque/midi-visualizer',
    category: 'Audio',
  },
  {
    name: 'minerva-roulette',
    description: 'Rotating assignment tool for determining who handles MIN tickets each week.',
    githubUrl: 'https://github.com/atlesque/minerva-roulette',
    category: 'Productivity',
  },
  {
    name: 'nuclear-launch',
    description: 'Hardware/software trigger project using an RP2040 switch/button to run an action.',
    githubUrl: 'https://github.com/atlesque/nuclear-launch',
    category: 'Developer',
  },
  {
    name: 'polaroid-generator',
    description: 'Offline browser tool that adds a Polaroid frame around an image.',
    githubUrl: 'https://github.com/atlesque/polaroid-generator',
    category: 'Images',
  },
  {
    name: 'pulse',
    description: 'Minimal task/status tracker with API updates and Cloudflare D1 persistence.',
    githubUrl: 'https://github.com/atlesque/pulse',
    category: 'Productivity',
  },
  {
    name: 'scrum-poker',
    description: 'Real-time planning poker app for agile teams.',
    githubUrl: 'https://github.com/atlesque/scrum-poker',
    category: 'Productivity',
  },
  {
    name: 'starfield-digipick-solver',
    description: 'Solver for Starfield Digipick lockpicking puzzles.',
    githubUrl: 'https://github.com/atlesque/starfield-digipick-solver',
    websiteUrl: 'https://starfield-digipick-solver.atlesque.dev/',
    category: 'Games',
  },
  {
    name: 'tales-from-the-loop-helper',
    description: 'Character-sheet helper app for Tales from the Loop.',
    githubUrl: 'https://github.com/atlesque/tales-from-the-loop-helper',
    category: 'Games',
  },
  {
    name: 'text-dictator',
    description: 'Text-to-speech dictation app with repeat, rate, voice, and active-text controls.',
    githubUrl: 'https://github.com/atlesque/text-dictator',
    category: 'Text',
  },
  {
    name: 'text-partitioner',
    description: 'Splits large text blocks into cleaner paragraph-like chunks.',
    githubUrl: 'https://github.com/atlesque/text-partitioner',
    category: 'Text',
  },
  {
    name: 'webrtc-video-chat',
    description: 'Minimal WebRTC text/video chat implementation.',
    githubUrl: 'https://github.com/atlesque/webrtc-video-chat',
    category: 'Web',
  },
];
