export const platform = () => "android";
export const arch = () => "arm64";
export const homedir = () => "/tmp";
export const tmpdir = () => "/tmp";
export const type = () => "Android";
export const release = () => "0";
export const hostname = () => "device";
export const userInfo = () => ({ username: "user", homedir: "/tmp" });
export default { platform, arch, homedir, tmpdir, type, release, hostname, userInfo };
