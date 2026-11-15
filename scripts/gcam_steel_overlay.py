"""Generate one explicit steel input-coefficient overlay for engineering tests."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import tempfile
import xml.etree.ElementTree as ET

FORMAT = 'gcam-steel-coefficient-overlay'
MAX_BYTES = 128 * 1024 * 1024


class OverlayError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise OverlayError(message)


def keys(value, allowed, label):
    require(isinstance(value, dict), f'{label} must be an object')
    require(set(value) == set(allowed), f'{label} fields must be: {", ".join(allowed)}')


def text(value, label):
    require(isinstance(value, str) and value.strip() == value and bool(value), f'{label} must be a nonempty string without surrounding spaces')
    return value


def number(value, label):
    require(type(value) in (int, float), f'{label} must be a JSON number, not a blank, string or boolean')
    try:
        require(math.isfinite(value), f'{label} must be finite')
    except OverflowError as exc:
        raise OverlayError(f'{label} is too large') from exc
    return value


def unique(parent, tag, attrs=None):
    attrs = attrs or {}
    nodes = [n for n in parent.findall(tag) if all(n.get(k) == v for k, v in attrs.items())]
    require(len(nodes) == 1, f'Expected exactly one {tag} {attrs}, found {len(nodes)}')
    return nodes[0]


def child_text(parent, tag):
    return text(unique(parent, tag).text, tag)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_xml(spec, base_directory, sources):
    text(spec['path'], 'source path')
    sha = spec['sha256']
    require(isinstance(sha, str) and re.fullmatch('[0-9a-f]{64}', sha) is not None, 'source sha256 must be 64 lowercase hexadecimal characters')
    p = (Path(base_directory) / spec['path']).resolve()
    require(p.is_file() and p.stat().st_size <= MAX_BYTES, 'XML source missing or exceeds 128 MiB')
    raw = p.read_bytes()
    require(len(raw) <= MAX_BYTES and digest(raw) == sha, 'Source XML hash changed: recheck the source and baseline')
    if p in sources:
        return sources[p]['root']
    try:
        decoded = raw.decode('utf-8-sig')
        require(re.search(r'<!\s*(DOCTYPE|ENTITY)\b', decoded, re.I) is None, 'DTD and entity declarations are not supported')
        root = ET.fromstring(decoded)
    except (UnicodeError, ET.ParseError) as exc:
        raise OverlayError('Source must be valid UTF-8 XML') from exc
    require(root.tag == 'scenario', 'XML root must be scenario')
    sources[p] = {'root': root, 'sha256': sha, 'bytes': len(raw)}
    return root


def xml_number(node):
    require(len(node) == 0, 'Source coefficient must be a numeric leaf')
    try:
        value = float(node.text)
    except (TypeError, ValueError) as exc:
        raise OverlayError('Source coefficient is not numeric') from exc
    require(math.isfinite(value) and value >= 0, 'Source coefficient must be finite and nonnegative')
    return value


def prepare_overlay(request, base_directory='.'):
    keys(request, ['format', 'version', 'testOnly', 'source', 'target', 'commodity', 'operation'], 'request')
    require(request['format'] == FORMAT and type(request['version']) is int and request['version'] == 1, 'Unsupported request format/version')
    require(request['testOnly'] is True, 'Only explicitly marked engineering tests are supported; research mappings are not approved by this tool')
    keys(request['source'], ['path', 'sha256'], 'source')
    target, commodity, operation = request['target'], request['commodity'], request['operation']
    keys(target, ['region', 'sector', 'subsector', 'technology', 'year', 'input', 'expectedBaseline', 'unit'], 'target')
    keys(commodity, ['path', 'sha256', 'region', 'kind', 'name'], 'commodity')
    keys(operation, ['kind', 'value'], 'operation')
    for key in ['region', 'sector', 'subsector', 'technology', 'input', 'unit']:
        text(target[key], 'target.' + key)
    require(target['sector'] == 'iron and steel', 'This adapter only handles iron and steel')
    require(type(target['year']) is int and 1900 <= target['year'] <= 2300, 'year must be an integer in 1900..2300')
    expected = number(target['expectedBaseline'], 'expectedBaseline')
    require(expected >= 0, 'expectedBaseline must be nonnegative')
    sources = {}
    root = read_xml(request['source'], base_directory, sources)
    world = unique(root, 'world')
    region = unique(world, 'region', {'name': target['region']})
    sector = unique(region, 'supplysector', {'name': target['sector']})
    require(child_text(sector, 'output-unit') == 'Mt', 'Steel output-unit must be explicitly Mt')
    sub = unique(sector, 'subsector', {'name': target['subsector']})
    tech = unique(sub, 'stub-technology', {'name': target['technology']})
    period = unique(tech, 'period', {'year': str(target['year'])})
    inp = unique(period, 'minicam-energy-input', {'name': target['input']})
    require(not inp.findall('efficiency'), 'Target also specifies efficiency: coefficient precedence must be reviewed')
    node = unique(inp, 'coefficient')
    require(not node.attrib, 'Coefficient attributes are unsupported; interpolation/fillout scope must be reviewed')
    baseline = xml_number(node)
    require(baseline == expected, 'Source coefficient differs from expectedBaseline; no implicit rebasing')
    market = child_text(inp, 'market-name')
    for key in ['region', 'kind', 'name']:
        text(commodity[key], 'commodity.' + key)
    require(commodity['kind'] in ['supplysector', 'unlimited-resource'], 'Unsupported commodity kind')
    require(commodity['region'] == market and commodity['name'] == target['input'], 'Commodity proof does not match the input and market')
    supply_root = read_xml(commodity, base_directory, sources)
    supply_region = unique(unique(supply_root, 'world'), 'region', {'name': market})
    supply = unique(supply_region, commodity['kind'], {'name': target['input']})
    input_unit = child_text(supply, 'output-unit')
    require(input_unit in ['EJ', 'Mt'], 'Only explicit EJ or Mt commodity output units are supported')
    unit = input_unit + '/Mt'
    require(target['unit'] == unit, f'Unit mismatch: source implies {unit}')
    value = number(operation['value'], 'operation.value')
    kind = operation['kind']
    require(kind in ['set-coefficient', 'coefficient-multiplier', 'coefficient-decrease-percent', 'reciprocal-efficiency-increase-percent'], 'Unsupported operation; costs and share weights are not coefficients')
    require(value >= 0, 'Operation value must be nonnegative')
    if kind == 'set-coefficient':
        written = value
    elif kind == 'coefficient-multiplier':
        written = baseline * value
    elif kind == 'coefficient-decrease-percent':
        require(value <= 100, 'Coefficient decrease cannot exceed 100 percent')
        written = baseline * (1 - value / 100)
    else:
        require(baseline > 0, 'Reciprocal efficiency is undefined for a zero coefficient')
        written = baseline / (1 + value / 100)
    number(written, 'computed coefficient')
    require(written >= 0, 'Computed coefficient must be nonnegative')
    result = ET.Element('scenario')
    parent = ET.SubElement(result, 'world')
    for tag, attrs in [('region', {'name': target['region']}), ('supplysector', {'name': target['sector']}), ('subsector', {'name': target['subsector']}), ('stub-technology', {'name': target['technology']}), ('period', {'year': str(target['year'])}), ('minicam-energy-input', {'name': target['input']})]:
        parent = ET.SubElement(parent, tag, attrs)
    ET.SubElement(parent, 'coefficient').text = repr(float(written))
    ET.indent(result)
    xml = ET.tostring(result, encoding='utf-8', xml_declaration=True)
    audit = {
        'format': FORMAT + '-audit', 'version': 1, 'testOnly': True,
        'researchMappingApproved': False, 'cibConsistencyEvaluated': False, 'nativeModelRun': 'not-performed-by-this-adapter',
        'sourceSha256': request['source']['sha256'], 'target': dict(target),
        'commodityUnit': input_unit, 'coefficientUnit': unit, 'market': market,
        'operation': dict(operation), 'writtenCoefficient': written, 'overlaySha256': digest(xml),
        'leafChanges': 1, 'scope': 'One explicit coefficient of one new vintage; not a whole-industry energy or technology-share target',
        'sameVintageMayOperateInLaterYears': True,
        'loading': 'Append after all components that modify this node. This adapter does not validate the complete configuration or later overwrites.',
        'sources': [{'role': role, 'sha256': sources[(Path(base_directory) / spec['path']).resolve()]['sha256']} for role, spec in [('steel', request['source']), ('commodity', commodity)]]
    }
    return xml, audit, sources


def generate_bundle(request, destination, base_directory='.'):
    destination = Path(destination).resolve()
    require(not destination.exists(), 'Output directory already exists; choose a new directory')
    xml, audit, sources = prepare_overlay(request, base_directory)
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.steel-overlay-', dir=destination.parent))
    try:
        (staging / 'overlay.xml').write_bytes(xml)
        (staging / 'audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
        for source, info in sources.items():
            require(source.stat().st_size <= MAX_BYTES and digest(source.read_bytes()) == info['sha256'], 'Source changed while generating; no bundle published')
        require(not destination.exists(), 'Output directory appeared during generation')
        staging.rename(destination)
    finally:
        if staging.exists():
            require(staging.resolve().parent == destination.parent and staging.name.startswith('.steel-overlay-'), 'Unexpected staging path; cleanup stopped')
            shutil.rmtree(staging)
    return audit


def load_request(path):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate JSON key: ' + key)
            result[key] = value
        return result

    def constant(value):
        raise OverlayError('Non-finite JSON number: ' + value)

    return json.loads(Path(path).read_text(encoding='utf-8-sig'), object_pairs_hook=pairs, parse_constant=constant)


def main():
    parser = argparse.ArgumentParser(description='Generate a single steel coefficient overlay bundle for engineering tests; Python 3.10+, standard library only.')
    parser.add_argument('--request', required=True, type=Path)
    parser.add_argument('--out-dir', required=True, type=Path)
    args = parser.parse_args()
    try:
        audit = generate_bundle(load_request(args.request), args.out_dir, args.request.resolve().parent)
        print(json.dumps(audit, ensure_ascii=True, indent=2, allow_nan=False))
    except (OverlayError, OSError, ValueError) as exc:
        parser.exit(1, 'Not generated: ' + str(exc) + '\n')


if __name__ == '__main__':
    main()
