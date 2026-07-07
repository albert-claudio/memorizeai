export type FileType = 'pdf' | 'docx' | 'pptx';

export interface SlideContent {
  slideNumber: number;
  title: string;
  body: string;
}

export interface ExtractionResult {
  text: string;
  pageCount: number;
  slides?: SlideContent[];
}
