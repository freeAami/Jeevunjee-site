import os, subprocess, sys, uuid
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.environ.get('PGHOST', '/home/claude/pgtest')
def psql(sql, db='jvj', role=None, uid=None):
    pre = ''
    if role: pre += f"set role {role}; "
    pre += f"select set_config('request.jwt.claim.sub', '{uid or ''}', false); "
    r = subprocess.run(['psql','-h',D,'-p','54329','-U','postgres','-d',db,'-At','-q','-v','ON_ERROR_STOP=1','-c', pre + sql],
                       capture_output=True, text=True)
    out = [l for l in r.stdout.strip().split('\n') if l != '']
    return r.returncode == 0, (out[-1] if out else ''), r.stderr.strip()
fails = 0
def check(name, cond, detail=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else f'   <- {detail}'))
    if not cond: fails += 1
def ok(name, sql, **kw):
    s, out, err = psql(sql, **kw); check(name, s, err); return out
def denied(name, sql, **kw):
    s, out, err = psql(sql, **kw); check(name, not s, f'unexpectedly succeeded: {out}')
def equals(name, sql, expected, **kw):
    s, out, err = psql(sql, **kw); check(name, s and out == str(expected), f'got {out!r} {err}')
    return out

subprocess.run(['psql','-h',D,'-p','54329','-U','postgres','-qc','drop database if exists jvj'], capture_output=True)
subprocess.run(['psql','-h',D,'-p','54329','-U','postgres','-qc','drop role if exists anon; drop role if exists authenticated'], capture_output=True)
subprocess.run(['psql','-h',D,'-p','54329','-U','postgres','-qc','create database jvj'], check=True)
for f in [os.path.join(HERE, 'supabase_shim.sql'), os.path.join(HERE, '..', 'schema.sql'), os.path.join(HERE, '..', 'schema.sql')]:
    r = subprocess.run(['psql','-h',D,'-p','54329','-U','postgres','-d','jvj','-q','-v','ON_ERROR_STOP=1','-f',f], capture_output=True, text=True)
    check(f'load {f.split("/")[-1]}', r.returncode == 0, r.stderr[-600:])
if fails: sys.exit(1)

# --- sign-ups ---------------------------------------------------------------
ok('allow-list trustee', "insert into admin_emails values ('trustee@x.test')")
denied('stranger cannot sign up', "insert into auth.users (email) values ('evil@x.test')")
A = ok('trustee signs up', "insert into auth.users (email) values ('Trustee@x.test') returning id")
equals('trustee became admin', f"select role from profiles where id = '{A}'", 'admin')
denied('stranger with bogus code cannot sign up', """insert into auth.users (email, raw_user_meta_data) values ('evil2@x.test', '{"access_code":"ABCDEFGH"}')""")

# --- public applicant -------------------------------------------------------
fid = str(uuid.uuid4())
answers = """'{"fullName":"Test Applicant","email":"a@x.test","phone":"077","signatureName":"Test Applicant","dateOfBirth":"2004-04-22",
 "courseTitle":"BEng EEE","institution":"SLIIT","totalFeeLkr":"1320000","totalFeeForeign":"950","foreignCurrency":"GBP","durationYears":"3",
 "plan":[{"label":"Year 1","when":"2023-09","amountLkr":"440000","amountForeign":"","payer":"self"},
         {"label":"Year 3","when":"2025-09","amountLkr":"440000","amountForeign":"950","payer":"trust"}]}'::jsonb"""
files = f"""'[{{"field":"photo","label":"Passport photo","name":"me.jpg","path":"incoming/{fid}/photo.jpg","mime":"image/jpeg","size":1000}},
             {{"field":"edu:1","label":"IGCSE certificate","name":"c.pdf","path":"incoming/{fid}/cert.pdf","mime":"application/pdf","size":2000}}]'::jsonb"""
ref = ok('anon submits application', f"select submit_application({answers}, {files})", role='anon')
check('reference format', ref.startswith('JVJ-') and len(ref) == 14, ref)
equals('anon cannot read applications', "select count(*) from applications", 0, role='anon')
denied('anon cannot insert application directly', "insert into applications (reference, full_name, answers) values ('x','y','{}')", role='anon')
denied('anon submit rejects bad file path', f"""select submit_application({answers}, '[{{"path":"../files/students/x"}}]')""", role='anon')
denied('anon submit needs a signature', """select submit_application('{"fullName":"X","email":"e"}', '[]')""", role='anon')
ok('anon uploads application file', f"insert into storage.objects (bucket_id, name) values ('applications', 'incoming/{fid}/photo.jpg'), ('applications','incoming/{fid}/cert.pdf')", role='anon')
denied('anon cannot upload into student files', "insert into storage.objects (bucket_id, name) values ('files', 'students/x/a.pdf')", role='anon')
equals('anon cannot list storage', "select count(*) from storage.objects", 0, role='anon')
equals('anon cannot read students', "select count(*) from students", 0, role='anon')
denied('anon cannot issue access codes', "select issue_access_code(gen_random_uuid())", role='anon')

# --- trustee ----------------------------------------------------------------
equals('trustee sees the application', "select count(*) from applications", 1, role='authenticated', uid=A)
trust = equals('trusts seeded', "select count(*) from trusts", 2, role='authenticated', uid=A)
T = ok('get trust id', "select id from trusts where name = 'Rukan Trust'", role='authenticated', uid=A)
appid = ok('get application id', "select id from applications", role='authenticated', uid=A)
S1 = ok('trustee enrols applicant', f"select enrol_application('{appid}', '{T}')", role='authenticated', uid=A)
equals('student got a code', f"select code from students where id = '{S1}'", 'S-001', role='authenticated', uid=A)
equals('course created with fees', f"select title || '|' || total_fee_lkr || '|' || total_fee_foreign || foreign_currency from courses where student_id = '{S1}'", 'BEng EEE|1320000.00|950.00GBP', role='authenticated', uid=A)
equals('plan became 2 instalments', f"select string_agg(funded_by || ':' || coalesce(foreign_currency,'-'), ',' order by label) from instalments where student_id = '{S1}'", 'self:-,trust:GBP', role='authenticated', uid=A)
equals('application files became documents', f"select string_agg(category, ',' order by category) from documents where student_id = '{S1}'", 'certificate,photo', role='authenticated', uid=A)
equals('application marked accepted', f"select status from applications where id = '{appid}'", 'accepted', role='authenticated', uid=A)
S2 = ok('trustee adds another student by hand', "insert into students (full_name) values ('Other Student') returning id", role='authenticated', uid=A)
C2 = ok('course for other student', f"insert into courses (student_id, trust_id, title) values ('{S2}', '{T}', 'BSc') returning id", role='authenticated', uid=A)
ok('instalment for other student', f"insert into instalments (course_id, student_id, label, amount_lkr) values ('{C2}', '{S1}', 'Year 1', 1000)", role='authenticated', uid=A)
equals('instalment student forced to match course', f"select count(*) from instalments where course_id = '{C2}' and student_id = '{S2}'", 1, role='authenticated', uid=A)
equals('payment cost locked with rate', f"insert into payments (student_id, paid_on, amount_lkr, amount_foreign, foreign_currency, fx_rate) values ('{S1}', '2024-01-10', 50000, 325, 'GBP', 450) returning total_lkr", '196250.00', role='authenticated', uid=A)
denied('foreign amount needs a currency', f"insert into payments (student_id, paid_on, amount_foreign) values ('{S1}', '2024-01-10', 10)", role='authenticated', uid=A)
ok('trustee writes notes', f"insert into notes (student_id, body) values ('{S1}', 'private'), ('{S2}', 'private 2')", role='authenticated', uid=A)
ok('trustee uploads to student folder', f"insert into storage.objects (bucket_id, name) values ('files', 'students/{S1}/inv.pdf'), ('files', 'students/{S2}/inv.pdf')", role='authenticated', uid=A)
code = ok('trustee issues access code', f"select issue_access_code('{S1}')", role='authenticated', uid=A)
check('code is 8 safe characters', len(code) == 8 and not any(c in code for c in '01IO'), code)

# --- student ----------------------------------------------------------------
U = ok('student signs up with code', f"""insert into auth.users (email, raw_user_meta_data) values ('stu@x.test', '{{"access_code":"{code[:4]}-{code[4:].lower()}"}}') returning id""")
equals('student profile linked', f"select role || ':' || (student_id = '{S1}') from profiles where id = '{U}'", 'student:true')
denied('code works only once', f"""insert into auth.users (email, raw_user_meta_data) values ('stu2@x.test', '{{"access_code":"{code}"}}')""")
equals('student sees only themself', "select string_agg(id::text, ',') from students", S1, role='authenticated', uid=U)
equals('student sees own instalments only', "select count(*) from instalments", 2, role='authenticated', uid=U)
equals('student sees own payments', "select count(*) from payments", 1, role='authenticated', uid=U)
equals('student cannot see notes', "select count(*) from notes", 0, role='authenticated', uid=U)
equals('student cannot see applications', "select count(*) from applications", 0, role='authenticated', uid=U)
equals('student cannot see other profiles', "select count(*) from profiles", 1, role='authenticated', uid=U)
equals('student cannot edit their record', f"with u as (update students set full_name = 'hacked' where id = '{S1}' returning 1) select count(*) from u", 0, role='authenticated', uid=U)
denied('student cannot add notes', f"insert into notes (student_id, body) values ('{S1}', 'x')", role='authenticated', uid=U)
denied('student cannot log payments', f"insert into payments (student_id, paid_on) values ('{S1}', '2024-01-01')", role='authenticated', uid=U)
equals('student cannot mark instalments paid', "with u as (update instalments set status = 'paid' returning 1) select count(*) from u", 0, role='authenticated', uid=U)
ok('student uploads an invoice record', f"insert into documents (student_id, path, category, title, uploaded_by, uploaded_by_role) values ('{S1}', 'students/{S1}/x.pdf', 'invoice', 'Invoice', '{U}', 'student')", role='authenticated', uid=U)
denied('student cannot file it as identity', f"insert into documents (student_id, path, category, title, uploaded_by, uploaded_by_role) values ('{S1}', 'students/{S1}/y.pdf', 'identity', 'ID', '{U}', 'student')", role='authenticated', uid=U)
denied('student cannot pose as admin uploader', f"insert into documents (student_id, path, category, title, uploaded_by, uploaded_by_role) values ('{S1}', 'students/{S1}/y.pdf', 'invoice', 'I', '{U}', 'admin')", role='authenticated', uid=U)
denied('student cannot add to another file', f"insert into documents (student_id, path, category, title, uploaded_by, uploaded_by_role) values ('{S2}', 'students/{S2}/y.pdf', 'invoice', 'I', '{U}', 'student')", role='authenticated', uid=U)
ok('student uploads to own folder', f"insert into storage.objects (bucket_id, name) values ('files', 'students/{S1}/mine.pdf')", role='authenticated', uid=U)
denied('student cannot upload to another folder', f"insert into storage.objects (bucket_id, name) values ('files', 'students/{S2}/x.pdf')", role='authenticated', uid=U)
equals('student storage view is own files + own application files', "select string_agg(name, ',' order by name) from storage.objects",
       f"incoming/{fid}/cert.pdf,incoming/{fid}/photo.jpg,students/{S1}/inv.pdf,students/{S1}/mine.pdf", role='authenticated', uid=U)
denied('student cannot issue codes', f"select issue_access_code('{S2}')", role='authenticated', uid=U)
denied('student cannot enrol', f"select enrol_application('{appid}', '{T}')", role='authenticated', uid=U)
equals('student cannot delete files', "with u as (delete from storage.objects returning 1) select count(*) from u", 0, role='authenticated', uid=U)
equals('student cannot read admin allow-list', "select count(*) from admin_emails", 0, role='authenticated', uid=U)
denied('random_code not callable from the site', "select random_code(5)", role='anon')

equals('records untouched after student attempts', f"select (select full_name from students where id = '{S1}') || '|' || (select count(*) from instalments where status='paid') || '|' || (select count(*) from storage.objects)", 'Test Applicant|0|5', role='authenticated', uid=A)
print(f'\n{fails} failure(s)')
sys.exit(1 if fails else 0)
