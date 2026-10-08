#!/usr/bin/env python3
"""Trusted parent-side artifact promotion (security-audit skill, SKILL.md "Write isolation").

usage: promote.py <output-dir> <agent-id> <per-file-max-bytes> <total-max-bytes> <relpath> [<relpath> ...]

Copies each allowlisted scratch-relative file from agents/<id>/scratch/ to agents/<id>/artifacts/,
walking every component with no-follow, directory-relative operations from retained descriptors.
Prints one JSON line per file: {"path": ..., "status": "promoted"|"rejected", "reason": ...}.
"""
import json, os, re, stat, sys

AGENT_RE = re.compile(r'^[a-z0-9][a-z0-9_-]{0,63}$')
WINDOWS = {'con', 'prn', 'aux', 'nul'} | {f'com{i}' for i in range(1, 10)} | {f'lpt{i}' for i in range(1, 10)}
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def parts_of(rel):
    if not rel or rel.startswith('/') or '\\' in rel or '\x00' in rel:
        raise ValueError('absolute, empty or unsafe path')
    parts = rel.split('/')
    if any(p in ('', '.', '..') for p in parts):
        raise ValueError('empty, . or .. component')
    return parts


def promote(scratch_fd, art_fd, rel, per_file, remaining):
    parts = parts_of(rel)
    # 2. walk source parents no-follow from the retained scratch descriptor
    d = os.dup(scratch_fd)
    try:
        for p in parts[:-1]:
            nd = os.open(p, DIR_FLAGS, dir_fd=d)  # ELOOP/ENOTDIR on symlink or non-dir
            os.close(d)
            d = nd
        # 3. open leaf no-follow, nonblocking
        src = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=d)
    finally:
        os.close(d)
    try:
        st = os.fstat(src)
        # 4. regular file, single link, within limits
        if not stat.S_ISREG(st.st_mode):
            raise ValueError('not a regular file')
        if st.st_nlink != 1:
            raise ValueError('link count is not exactly one')
        if st.st_size > per_file or st.st_size > remaining:
            raise ValueError('exceeds byte limit')
        # 5./6. read exactly the verified size, enforcing limits while reading
        chunks, got = [], 0
        while got < st.st_size:
            b = os.read(src, min(65536, st.st_size - got))
            if not b:
                break
            got += len(b)
            if got > per_file or got > remaining:
                raise ValueError('exceeded byte limit while reading')
            chunks.append(b)
        if os.read(src, 1):
            raise ValueError('file grew while reading')
        st2 = os.fstat(src)
        if (st2.st_ino, st2.st_dev, st2.st_mode, st2.st_nlink, st2.st_size) != (st.st_ino, st.st_dev, st.st_mode, st.st_nlink, st.st_size) or got != st.st_size:
            raise ValueError('file changed during copy')
        data = b''.join(chunks)
    finally:
        os.close(src)
    # 7. walk/create destination parents no-follow from the retained artifacts descriptor
    d = os.dup(art_fd)
    try:
        for p in parts[:-1]:
            try:
                nd = os.open(p, DIR_FLAGS, dir_fd=d)
            except FileNotFoundError:
                os.mkdir(p, 0o755, dir_fd=d)  # exclusive create
                nd = os.open(p, DIR_FLAGS, dir_fd=d)
            if not stat.S_ISDIR(os.fstat(nd).st_mode):
                os.close(nd)
                raise ValueError('destination component is not a directory')
            os.close(d)
            d = nd
        # 8. exclusive, no-follow leaf creation
        dst = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o644, dir_fd=d)
    finally:
        os.close(d)
    try:
        dst_st = os.fstat(dst)
        if not stat.S_ISREG(dst_st.st_mode) or dst_st.st_nlink != 1:
            raise ValueError('destination is not a single-link regular file')
        view = memoryview(data)
        while view:
            n = os.write(dst, view)
            view = view[n:]
    finally:
        os.close(dst)
    return len(data)


def main():
    out, agent, per_file, total, *rels = sys.argv[1:]
    per_file, total = int(per_file), int(total)
    if not AGENT_RE.match(agent) or agent in WINDOWS:
        sys.exit('unsafe agent id')
    root = os.open(out, DIR_FLAGS)
    agents = os.open('agents', DIR_FLAGS, dir_fd=root)
    adir = os.open(agent, DIR_FLAGS, dir_fd=agents)
    scratch_fd = os.open('scratch', DIR_FLAGS, dir_fd=adir)
    art_fd = os.open('artifacts', DIR_FLAGS, dir_fd=adir)
    used = 0
    for rel in rels:
        try:
            used += promote(scratch_fd, art_fd, rel, per_file, total - used)
            print(json.dumps({'path': f'agents/{agent}/artifacts/{rel}', 'status': 'promoted'}))
        except Exception as e:  # discard on any failure (step 11)
            print(json.dumps({'path': rel, 'status': 'rejected', 'reason': str(e)}))


if __name__ == '__main__':
    main()
