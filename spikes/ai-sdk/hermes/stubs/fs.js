export const join = (...p) => p.join("/");
export const dirname = (p) => String(p).replace(/\/[^/]*$/, "");
export const existsSync = () => false;
export const readFileSync = () => "";
export const homedir = () => "/tmp";
export const tmpdir = () => "/tmp";
export const cwd = () => "/";
export default { join, dirname, existsSync, readFileSync, homedir, tmpdir, cwd };
