import math, sys

W, H = 1720, 1200
out = []
def add(s): out.append(s)

E = {  # entity: (x, y)
    'USERS': (800, 170), 'AUDIT_LOGS': (260, 170),
    'ADMISSIONS': (380, 500), 'WARDS': (380, 950),
    'PATIENTS': (800, 720), 'CLINICAL_NOTES': (1220, 500),
    'PRESCRIPTIONS': (1220, 900), 'MEDICATIONS': (1220, 1100),
}
R = {  # relationship: (x, y, a, b, card_a, card_b, total_b)
    'logs':      (530, 170, 'USERS', 'AUDIT_LOGS', '1', 'N'),
    'attends':   (590, 335, 'USERS', 'ADMISSIONS', '1', 'N'),
    'writes':    (1010, 335, 'USERS', 'CLINICAL_NOTES', '1', 'N'),
    'has':       (590, 610, 'PATIENTS', 'ADMISSIONS', '1', 'N'),
    'describes': (1010, 610, 'PATIENTS', 'CLINICAL_NOTES', '1', 'N'),
    'houses':    (380, 770, 'WARDS', 'ADMISSIONS', '1', 'N'),
    'receives':  (1010, 800, 'PATIENTS', 'PRESCRIPTIONS', '1', 'N'),
    'contains':  (1220, 1000, 'MEDICATIONS', 'PRESCRIPTIONS', '1', 'N'),
}
# attributes: entity -> list of (label, angle_deg (y up), radius, kind)
# kind: k = key (underlined), d = derived (dashed), n = normal
A = {
    'USERS': [('user_id', 200, 110, 'k'), ('full_name', 150, 110, 'n'), ('email', 115, 130, 'n'),
              ('password_hash', 82, 115, 'n'), ('role', 40, 120, 'n'), ('created_at', 12, 170, 'n')],
    'AUDIT_LOGS': [('log_id', 125, 100, 'k'), ('action_type', 65, 100, 'n'),
                   ('description', 235, 100, 'n'), ('logged_at', 295, 100, 'n')],
    'ADMISSIONS': [('admission_id', 150, 130, 'k'), ('admission_date', 180, 120, 'n'),
                   ('discharge_date', 210, 130, 'n'), ('status', 240, 110, 'n')],
    'WARDS': [('ward_id', 165, 130, 'k'), ('ward_name', 205, 125, 'n'),
              ('total_capacity', 250, 105, 'n'), ('occupied_beds', 300, 120, 'n')],
    'PATIENTS': [('patient_id', 120, 115, 'k'), ('first_name', 90, 150, 'n'), ('created_at', 60, 115, 'n'),
                 ('emergency_contact', 168, 200, 'n'), ('last_name', (545, 740), 0, 'n'), ('dob', (590, 790), 0, 'n'),
                 ('age', (655, 838), 0, 'd'), ('gender', (735, 880), 0, 'n'), ('blood_group', (845, 905), 0, 'n'),
                 ('phone_number', (930, 860), 0, 'n')],
    'CLINICAL_NOTES': [('note_id', 70, 115, 'k'), ('chief_complaint', 35, 130, 'n'),
                       ('observation_text', 5, 150, 'n'), ('embedding (384-d)', 335, 150, 'n'),
                       ('search_tsv', 302, 150, 'd'), ('created_at', 275, 120, 'n')],
    'PRESCRIPTIONS': [('prescription_id', 55, 135, 'k'), ('dosage', 25, 140, 'n'),
                      ('quantity', 345, 140, 'n'), ('prescribed_date', 315, 140, 'n')],
    'MEDICATIONS': [('med_id', 170, 150, 'k'), ('med_name', 200, 140, 'n'),
                    ('stock_quantity', 10, 150, 'n'), ('unit_price', 340, 150, 'n')],
}

EW, EH = 190, 52
def rect_edge(cx, cy, tx, ty, w=EW, h=EH):
    dx, dy = tx - cx, ty - cy
    if dx == 0 and dy == 0: return cx, cy
    s = min((w / 2) / abs(dx) if dx else 1e9, (h / 2) / abs(dy) if dy else 1e9)
    return cx + dx * s, cy + dy * s

add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Helvetica, Arial, sans-serif">')
add(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
add('<style>.l{stroke:#333;stroke-width:1.4;fill:none}.a{fill:#fff;stroke:#555;stroke-width:1.2}'
    '.e{fill:#e8f0fb;stroke:#1f4e8c;stroke-width:2}.r{fill:#fdf1e3;stroke:#a85d00;stroke-width:2}'
    'text{font-size:13px;fill:#111;text-anchor:middle;dominant-baseline:central}.t{font-size:15px;font-weight:bold}'
    '.c{font-size:14px;font-weight:bold;fill:#a85d00}</style>')

lines, shapes = [], []
# attribute lines + ovals
for ent, attrs in A.items():
    ex, ey = E[ent]
    for label, ang, rad, kind in attrs:
        if isinstance(ang, tuple):
            ax, ay = ang
        else:
            t = math.radians(ang)
            ax, ay = ex + rad * 1.6 * math.cos(t), ey - rad * math.sin(t)
        rx = max(42, len(label) * 4.3 + 14)
        sx, sy = rect_edge(ex, ey, ax, ay)
        lines.append(f'<line class="l" x1="{sx:.1f}" y1="{sy:.1f}" x2="{ax:.1f}" y2="{ay:.1f}"/>')
        dash = ' stroke-dasharray="5 3"' if kind == 'd' else ''
        shapes.append(f'<ellipse class="a" cx="{ax:.1f}" cy="{ay:.1f}" rx="{rx:.1f}" ry="17"{dash}/>')
        deco = ' text-decoration="underline"' if kind == 'k' else ''
        shapes.append(f'<text x="{ax:.1f}" y="{ay:.1f}"{deco}>{label}</text>')

# relationships
DW, DH = 62, 34
for name, (rx_, ry_, a, b, ca, cb) in R.items():
    pts = f'{rx_},{ry_-DH} {rx_+DW},{ry_} {rx_},{ry_+DH} {rx_-DW},{ry_}'
    for ent, card in ((a, ca), (b, cb)):
        ex, ey = E[ent]
        sx, sy = rect_edge(ex, ey, rx_, ry_)
        lines.append(f'<line class="l" x1="{sx:.1f}" y1="{sy:.1f}" x2="{rx_}" y2="{ry_}"/>')
        mx, my = sx + (rx_ - sx) * 0.3, sy + (ry_ - sy) * 0.3
        nx, ny = (ry_ - sy), -(rx_ - sx)
        n = math.hypot(nx, ny) or 1
        shapes.append(f'<text class="c" x="{mx + nx / n * 12:.1f}" y="{my + ny / n * 12:.1f}">{card}</text>')
    shapes.append(f'<polygon class="r" points="{pts}"/>')
    shapes.append(f'<text x="{rx_}" y="{ry_}" style="font-style:italic">{name}</text>')

# issues: USERS -> PRESCRIPTIONS routed round the right edge
ux, uy = E['USERS']; px, py = E['PRESCRIPTIONS']
ix, iy = 1640, 520
lines.append(f'<polyline class="l" points="{ux + EW/2},{uy} {ix},{uy} {ix},{iy - DH}"/>')
lines.append(f'<polyline class="l" points="{ix},{iy + DH} {ix},{py} {px + EW/2},{py}"/>')
shapes.append(f'<text class="c" x="{ix + 14}" y="{uy + 40}">1</text>')
shapes.append(f'<text class="c" x="{px + EW/2 + 30}" y="{py - 14}">N</text>')
shapes.append(f'<polygon class="r" points="{ix},{iy-DH} {ix+DW},{iy} {ix},{iy+DH} {ix-DW},{iy}"/>')
shapes.append(f'<text x="{ix}" y="{iy}" style="font-style:italic">issues</text>')

# entities
for ent, (ex, ey) in E.items():
    shapes.append(f'<rect class="e" x="{ex-EW/2}" y="{ey-EH/2}" width="{EW}" height="{EH}"/>')
    shapes.append(f'<text class="t" x="{ex}" y="{ey}">{ent}</text>')

# title + legend
shapes.append('<text x="24" y="30" style="font-size:20px;font-weight:bold;text-anchor:start">MedGraph: ER diagram (Chen notation)</text>')
lg = ['Rectangle = entity, diamond = relationship, oval = attribute',
      'Underlined = primary key; dashed oval = derived attribute (age from dob, search_tsv generated from note text)',
      'USERS covers both roles (DOCTOR, ADMIN); attends / writes / issues require role = DOCTOR (trigger)']
for i, s in enumerate(lg):
    shapes.append(f'<text x="24" y="{H - 70 + i * 20}" style="font-size:13px;text-anchor:start;fill:#444">{s}</text>')

out += lines + shapes
add('</svg>')
open(sys.argv[1], 'w', encoding='utf8').write('\n'.join(out))
