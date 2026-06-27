/** Direct file-system access for the in-app file viewer/editor and explorer. */

/** One entry in a directory listing. */
export interface DirEntry {
  name: string;
  /** Absolute path. */
  path: string;
  /** True for directories. */
  dir: boolean;
}

/** A file's text content for the viewer/editor. */
export interface FileContent {
  content: string;
  /** True if the file was longer than the read cap and content is partial. */
  truncated: boolean;
  /** True if the file looks binary (not shown as text). */
  binary: boolean;
}
