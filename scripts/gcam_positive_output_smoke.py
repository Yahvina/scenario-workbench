"""Synthetic GCAM 8.2 input-flow checks, not a calibrated industry model."""
import argparse
import hashlib
import json
import math
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET

YEARS = [1975, 1990, 2005, 2010, 2015, 2021, 2025, 2030, 2035]


def inspect_native_run(return_code, console, run_directory):
    """Reject known failures even when the native process prints completion."""
    sources = [('console', console.decode('utf-8', errors='replace'))]
    unread = []
    logs = Path(run_directory) / 'logs'
    paths = sorted(p for p in logs.glob('*') if p.is_file()) if logs.is_dir() else []
    if not paths:
        unread.append('No native log files found')
    for p in paths[:64]:
        try:
            with p.open('rb') as stream:
                data = stream.read(8 * 1024 * 1024 + 1)
            if len(data) > 8 * 1024 * 1024:
                unread.append(p.name + ': log exceeds 8 MiB review limit')
            sources.append(('logs/' + p.name, data[:8 * 1024 * 1024].decode('utf-8', errors='replace')))
        except OSError as error:
            unread.append(p.name + ': ' + str(error))
    if len(paths) > 64:
        unread.append('More than 64 log files require review')
    patterns = [
        r'could\s+not\s+parse\s+filter\s+string',
        r'\b(?:failed|unable)\s+to\s+(?:parse|load|open|read)\b',
        r'\b(?:error|fatal|severe)\s*[:\]]',
        r'^\s*\[(?:error|fatal|severe)\]',
        r'\b(?:not\s+all|no)\s+model\s+periods\s+(?:were\s+)?solved',
        r'\bunsolved\s+(?:periods|markets)\s*[:=]\s*[1-9]',
    ]
    critical, warnings = [], []
    completed = False
    for source, text in sources:
        for number, line in enumerate(text.splitlines(), 1):
            if line.strip() == 'All model periods solved correctly.':
                completed = True
            item = {'source': source, 'line': number, 'text': line[:1000]}
            if any(re.search(pattern, line, re.IGNORECASE) for pattern in patterns):
                critical.append(item)
            elif re.search(r'\bwarning\b', line, re.IGNORECASE):
                warnings.append(item)
    status = 'failed' if return_code != 0 or not completed or critical else 'needs-review' if warnings or unread else 'passed'
    return {'status': status, 'passed': status == 'passed', 'returnCode': return_code,
            'completionMessageSeen': completed, 'criticalFindings': critical,
            'warnings': warnings, 'unreadOrMissingLogs': unread,
            'sourcesChecked': [name for name, _ in sources],
            'scope': 'Known log diagnostics only; output checks still required. Not full-model calibration certification.'}


def need(value, message):
    if not value:
        raise ValueError(message)


def scalar(value):
    need(type(value) in (int, float), 'Expected a finite numeric value')
    try:
        need(math.isfinite(value), 'Expected a finite numeric value')
    except OverflowError as error:
        raise ValueError('Numeric value is too large') from error
    return value


def put(parent, tag, value=None, **attrs):
    node = ET.SubElement(parent, tag, {key.replace('_', '-'): str(v) for key, v in attrs.items()})
    if value is not None:
        node.text = str(value)
    return node


def xml_bytes(node):
    ET.indent(node)
    return ET.tostring(node, encoding='utf-8', xml_declaration=True)


def model_xml(target, coefficient, control, family):
    scalar(coefficient)
    need(coefficient > 0 and family in ['replacement', 'coexistence'], 'Invalid baseline or fixture family')
    need(target['sector'] == 'iron and steel' and target['year'] == 2030 and target['unit'] == 'EJ/Mt', 'Only 2030 steel energy coefficients in EJ/Mt are supported')
    need(all(isinstance(target[k], str) and target[k] for k in ['region', 'subsector', 'technology', 'input']), 'Target identifiers required')
    need(isinstance(control, str) and control and control != target['region'], 'Control region must be nonempty and distinct')
    need(target['input'] != 'synthetic-material', 'Input collides with the synthetic material name')
    root = ET.Element('scenario')
    root.append(ET.Comment('Synthetic engineering fixture; constant GDP/population, fixed demand, one process, unlimited fixed-price inputs. Not real provincial data.'))
    world = put(root, 'world'); put(world, 'no-climate-model')
    database = put(world, 'global-technology-database')
    location = put(database, 'location-info', sector_name=target['sector'], subsector_name=target['subsector'])
    technology = put(location, 'technology', name=target['technology'])
    for year in YEARS:
        period = put(technology, 'period', year=year)
        put(period, 'share-weight', 1)
        put(period, 'lifetime', 5 if family == 'replacement' else 20)
        for name, c in [(target['input'], coefficient), ('synthetic-material', 3)]:
            put(put(period, 'minicam-energy-input', name=name), 'coefficient', c)
    for name in [target['region'], control]:
        region = put(world, 'region', name=name)
        dem = put(region, 'demographics'); accounts = put(region, 'nationalAccountContainer')
        for year in YEARS:
            put(put(dem, 'populationMiniCAM', year=year), 'totalPop', 100)
            put(put(accounts, 'nationalAccount', year=year), 'GDP', 1000)
        for commodity, unit in [(target['input'], 'EJ'), ('synthetic-material', 'Mt')]:
            resource = put(region, 'unlimited-resource', name=commodity)
            put(resource, 'output-unit', unit); put(resource, 'price-unit', '1975$/GJ' if unit == 'EJ' else '1975$/kg'); put(resource, 'market', name)
            for year in YEARS:
                put(resource, 'price', 1, year=year)
        sector = put(region, 'supplysector', name=target['sector']); put(sector, 'output-unit', 'Mt'); put(sector, 'input-unit', 'EJ or Mt')
        put(put(sector, 'relative-cost-logit'), 'logit-exponent', -1, year=1975, fillout=1)
        sub = put(sector, 'subsector', name=target['subsector']); put(sub, 'share-weight', 1, year=1975, fillout=1)
        put(put(sub, 'relative-cost-logit'), 'logit-exponent', -1, year=1975, fillout=1)
        stub = put(sub, 'stub-technology', name=target['technology'])
        for year in YEARS:
            period = put(stub, 'period', year=year)
            for commodity, c in [(target['input'], coefficient), ('synthetic-material', 3)]:
                inp = put(period, 'minicam-energy-input', name=commodity)
                put(inp, 'market-name', name); put(inp, 'coefficient', c)
        demand = put(region, 'fixed-final-demand', name=target['sector'])
        for year in YEARS:
            put(demand, 'service', 2 if family == 'coexistence' and year >= 2030 else 1, year=year)
    return xml_bytes(root)


def support_files(region):
    modeltime = ET.Element('scenario'); time = put(modeltime, 'modeltime')
    put(time, 'start-year', 1975, time_step=15); put(time, 'final-calibration-year', 2021); put(time, 'end-year', 2035); put(time, 'carbon-model-start-year', 1705)
    for year, step in [(2005, 5), (2015, 6), (2021, 4), (2025, 5)]: put(time, 'inter-year', year, time_step=step)
    solver = ET.Element('scenario'); solve = put(solver, 'user-configurable-solver', year=1975, fillout=1)
    put(solve, 'solution-tolerance', .001); put(solve, 'solution-floor', .0001); put(solve, 'max-model-calcs', 1000)
    component = put(solve, 'bisect-all-solver-component'); put(component, 'max-iterations', 20); put(component, 'solution-info-filter', 'solvable')
    logger = ET.Element('LoggerFactory')
    log = put(logger, 'Logger', name='main_log', type='PlainTextLogger')
    put(log, 'FileName', 'logs/main_log.txt'); put(log, 'minLogWarningLevel', 0); put(log, 'minToScreenWarningLevel', 1)
    config = ET.Element('Configuration'); files = put(config, 'Files')
    for name, value, write in [('xmlInputFileName', 'modeltime.xml', 0), ('xmlDebugFileName', 'debug.xml', 1), ('xmldb-location', 'unused-db', 0)]: put(files, 'Value', value, name=name, write_output=write, append_scenario_name=0)
    components = put(config, 'ScenarioComponents')
    for name, value in [('synthetic-model', 'model.xml'), ('solver', 'solver.xml'), ('engineering-overlay', 'overlay.xml')]: put(components, 'Value', value, name=name)
    strings = put(config, 'Strings'); put(strings, 'Value', 'synthetic-positive-output-smoke', name='scenarioName'); put(strings, 'Value', region, name='debug-region')
    bools = put(config, 'Bools')
    for name, value in [('CalibrationActive', 1), ('FixedGDP-Path', 1), ('BatchMode', 0), ('find-path', 0), ('createCostCurve', 0), ('QuitFirstFailure', 1), ('debugChecking', 0)]: put(bools, 'Value', value, name=name)
    integers = put(config, 'Ints')
    for name, value in [('stop-year', 2035), ('stop-period', -1), ('restart-period', -1), ('restart-year', -1), ('max-parallelism', 1)]: put(integers, 'Value', value, name=name)
    put(config, 'Doubles')
    return {'modeltime.xml': xml_bytes(modeltime), 'solver.xml': xml_bytes(solver), 'log_conf.xml': xml_bytes(logger), 'configuration.xml': xml_bytes(config)}


def overlay_xml(target, coefficient):
    root = ET.Element('scenario'); parent = put(root, 'world')
    for tag, attrs in [('region', {'name': target['region']}), ('supplysector', {'name': target['sector']}), ('subsector', {'name': target['subsector']}), ('stub-technology', {'name': target['technology']}), ('period', {'year': '2030'}), ('minicam-energy-input', {'name': target['input']})]: parent = ET.SubElement(parent, tag, attrs)
    put(parent, 'coefficient', coefficient)
    return xml_bytes(root)


def near(actual, expected, label):
    need(math.isfinite(actual) and math.isclose(actual, expected, rel_tol=5e-6, abs_tol=1e-10), f'{label}: expected {expected}, observed {actual}')


def read_debug(path, target, region):
    records = []
    for world in ET.parse(path).findall('./world'):
        markets = world.findall('./Marketplace/market')
        need(markets, 'No market snapshots in native debug output')
        year = int(markets[0].get('year'))
        if year not in [2030, 2035]: continue
        areas = [r for r in world.findall('region') if r.get('name') == region]; need(len(areas) == 1, 'Missing or duplicate debug region')
        sectors = [n for n in areas[0].findall('supplysector') if n.get('name') == target['sector']]; need(len(sectors) == 1, 'Missing or duplicate steel sector')
        sector = sectors[0]; subsectors = sector.findall('subsector')
        need(len(subsectors) == 1 and subsectors[0].get('name') == target['subsector'], 'Fixture must contain exactly the selected process')
        rows = []
        for sub in sector.findall('subsector'):
            for tech in sub.findall('technology'):
                need(tech.get('name') == target['technology'], 'Unexpected technology in fixture')
                output = float(tech.findtext('./primary-output/output')); scalar(output); need(output >= 0, 'Negative output')
                inputs = {n.get('name'): n for n in tech.findall('minicam-energy-input')}
                need(len(tech.findall('minicam-energy-input')) == 2 and set(inputs) == {target['input'], 'synthetic-material'}, 'Unexpected or duplicate fixture inputs')
                energy = float(inputs[target['input']].findtext('physical-demand')); coef = float(inputs[target['input']].findtext('current-coef'))
                material = float(inputs['synthetic-material'].findtext('physical-demand'))
                for value in [energy, coef, material]: scalar(value); need(value >= 0, 'Negative native input or coefficient')
                near(energy, output * coef, 'Input = coefficient × vintage output'); near(material, output * 3, 'Material input')
                rows.append({'vintage': int(tech.get('year')), 'outputMt': output, 'energyInputEJ': energy, 'energyCoefficientEJperMt': coef, 'materialInputMt': material})
        need(len({r['vintage'] for r in rows}) == len(rows), 'Duplicate vintage in fixture')
        total = sum(r['outputMt'] for r in rows); need(total > 0, 'Zero-output fixture cannot pass this experiment')
        energy = sum(r['energyInputEJ'] for r in rows); material = sum(r['materialInputMt'] for r in rows)
        demand = next((n for n in areas[0].findall('fixed-final-demand') if n.get('name') == target['sector']), None)
        need(demand is not None, 'No fixed steel demand'); fixed = float(demand.findtext('service')); near(total, fixed, 'Steel output meets fixed demand')
        market_demands = []
        for commodity, amount in [(target['input'], energy), ('synthetic-material', material)]:
            matched = [n for n in markets if n.findtext('MarketGoodOrFuel') == commodity and n.findtext('MarketRegion') == region]
            need(len(matched) == 1, 'Missing or duplicate commodity market'); near(float(matched[0].findtext('demand')), amount, 'Market and vintage input demand')
            market_demands.append(float(matched[0].findtext('demand')))
        records.append({'year': year, 'region': region, 'outputMt': total, 'energyInputEJ': energy, 'materialInputMt': material, 'fixedSteelDemandMt': fixed, 'marketEnergyDemandEJ': market_demands[0], 'marketMaterialDemandMt': market_demands[1], 'vintages': rows})
    need([r['year'] for r in records] == [2030, 2035], 'Expected 2030 and 2035 snapshots')
    return records


def compare(records, baseline, changed, target_region, control):
    scalar(baseline); scalar(changed); need(baseline > 0 and changed >= 0, 'Invalid coefficients')
    summaries = []
    for family in ['replacement', 'coexistence']:
        for region in [target_region, control]:
            base = records[(family, 'baseline', region)]; variant = records[(family, 'changed', region)]
            need([r['year'] for r in base] == [2030, 2035] and [r['year'] for r in variant] == [2030, 2035], 'Snapshot years differ')
            for left, right in zip(base, variant):
                near(left['outputMt'], 1 if family == 'replacement' else 2, 'Expected constructed steel output')
                near(right['outputMt'], left['outputMt'], 'Output fixed across comparison'); near(right['materialInputMt'], left['materialInputMt'], 'Other material unchanged')
                old = {r['vintage']: r for r in left['vintages']}; new = {r['vintage']: r for r in right['vintages']}; need(old.keys() == new.keys(), 'Vintage set changed unexpectedly')
                affected_output = 0
                for vintage in old:
                    near(new[vintage]['outputMt'], old[vintage]['outputMt'], 'Vintage output unchanged')
                    affected = region == target_region and vintage == 2030
                    expected_coef = changed if affected else baseline
                    near(new[vintage]['energyCoefficientEJperMt'], expected_coef, 'Coefficient scope')
                    if affected: affected_output += new[vintage]['outputMt']
                expected = left['energyInputEJ'] + (changed - baseline) * affected_output
                near(right['energyInputEJ'], expected, 'Aggregate vintage-weighted energy input')
                if region == control: near(right['energyInputEJ'], left['energyInputEJ'], 'Control energy input unchanged')
                share = affected_output / right['outputMt']
                if region == target_region:
                    near(share, (1 if left['year'] == 2030 else 0) if family == 'replacement' else .5, 'Constructed affected-vintage output share')
                summaries.append({'family': family, 'region': region, 'year': left['year'], 'steelOutputMt': right['outputMt'], 'baselineEnergyEJ': left['energyInputEJ'], 'changedEnergyEJ': right['energyInputEJ'], 'affectedVintageOutputShare': share, 'coefficientReduction': 1 - changed / baseline, 'aggregateEnergyReduction': 1 - right['energyInputEJ'] / left['energyInputEJ']})
    return summaries


def result_bundle(report, frozen_case=None):
    need(report.get('status') == 'passed' and report.get('nativeRuns') == 8 and report.get('testOnly') is True, 'Only a completed engineering experiment can be packaged')
    need(all(report.get(k) is False for k in ['fullGCAMChina', 'policyEffectEvaluated', 'researchMappingApproved']), 'Engineering boundaries are required')
    report_json = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False)
    case_hash = hashlib.sha256(frozen_case).hexdigest() if frozen_case is not None else None
    need(report.get('linkedCaseSHA256') == case_hash and (report.get('caseCheck') is None) == (frozen_case is None), 'Linked case does not match the experiment')
    bundle = {'format': 'scenario-workbench.steel-input-flow-result', 'version': 1, 'testOnly': True, 'reportJson': report_json, 'reportSha256': hashlib.sha256(report_json.encode('utf-8')).hexdigest(), 'caseJson': frozen_case.decode('utf-8') if frozen_case is not None else None, 'caseSha256': case_hash}
    need(len(json.dumps(bundle, ensure_ascii=False, indent=2, allow_nan=False).encode('utf-8')) <= 16 * 1024 * 1024, 'Result bundle exceeds 16 MiB')
    return bundle


def run_experiment(exe, java_home, destination, work_root, case_file=None, control='CONTROL'):
    exe, java_home, destination, work_root = [Path(p).resolve() for p in [exe, java_home, destination, work_root]]
    need(exe.is_file() and java_home.is_dir(), 'GCAM executable or Java home missing'); need(not destination.exists(), 'Output directory already exists')
    need(str(work_root).isascii(), 'Use an ASCII-only work-root for this GCAM binary')
    work_root.mkdir(parents=True, exist_ok=True); work = Path(tempfile.mkdtemp(prefix='positive-steel-', dir=work_root))
    target = {'region': 'HE', 'sector': 'iron and steel', 'subsector': 'synthetic-process', 'technology': 'synthetic-technology', 'year': 2030, 'input': 'synthetic-electricity', 'unit': 'EJ/Mt'}
    baseline, changed, case_check, variant_xml, frozen_case = 2, 1.9, None, None, None
    if case_file:
        checker = Path(__file__).with_name('check-steel-cib-case.mjs')
        case_path = Path(case_file).resolve(); need(case_path.stat().st_size <= 8 * 1024 * 1024, 'Case exceeds 8 MiB')
        with case_path.open('rb') as stream: frozen_case = stream.read(8 * 1024 * 1024 + 1)
        need(len(frozen_case) <= 8 * 1024 * 1024, 'Case exceeds 8 MiB')
        snapshot = work / 'case-input.json'; snapshot.write_bytes(frozen_case)
        proc = subprocess.run(['node', str(checker), str(snapshot)], capture_output=True, timeout=20)
        need(proc.returncode == 0, 'CIB-linked case did not pass the standalone verifier: ' + proc.stderr.decode(errors='replace'))
        case_check = json.loads(proc.stdout); bundle = json.loads(frozen_case.decode('utf-8-sig'))
        request = bundle['parameter']['request']; target = request['target']; baseline = target['expectedBaseline']; changed = bundle['parameter']['audit']['writtenCoefficient']; variant_xml = bundle['parameter']['xml'].encode('utf-8')
    # Validate all fixture restrictions before creating output directories or starting GCAM.
    model_xml(target, baseline, control, 'replacement'); scalar(changed); need(changed >= 0, 'Negative changed coefficient')
    env = os.environ.copy(); env['JAVA_HOME'] = str(java_home); env['PATH'] = str(java_home / 'bin') + os.pathsep + str(java_home / 'bin/server') + os.pathsep + env['PATH']
    version = subprocess.run([str(exe), '--version'], capture_output=True, env=env, timeout=15, creationflags=0x08000000 if os.name == 'nt' else 0)
    version_text = (version.stdout + version.stderr).decode(errors='replace'); need(version.returncode == 0 and 'version 8.2' in version_text and 'gcam-v8.2' in version_text, 'Only the locally tested GCAM 8.2 revision is supported')
    destination.mkdir(parents=True)
    if frozen_case is not None: (destination / 'case-input.json').write_bytes(frozen_case)
    report = {'kind': 'synthetic-positive-output-steel-smoke', 'testOnly': True, 'status': 'running', 'fullGCAMChina': False, 'policyEffectEvaluated': False, 'researchMappingApproved': False, 'nativeExecutableSHA256': hashlib.sha256(exe.read_bytes()).hexdigest(), 'nativeVersionOutput': version_text, 'caseCheck': case_check, 'target': target, 'baselineCoefficient': baseline, 'changedCoefficient': changed, 'runs': []}
    observations = {}
    if frozen_case is not None: report['linkedCaseSHA256'] = hashlib.sha256(frozen_case).hexdigest()
    try:
        for family in ['replacement', 'coexistence']:
            for variant in ['baseline', 'changed']:
                for region in [target['region'], control]:
                    name = family + '-' + variant + '-' + region
                    # Native paths stay ASCII even if model region names contain Unicode.
                    run = work / str(len(report['runs'])); run.mkdir(); (run / 'logs').mkdir()
                    for filename, data in support_files(region).items(): (run / filename).write_bytes(data)
                    (run / 'model.xml').write_bytes(model_xml(target, baseline, control, family))
                    overlay = variant_xml if variant == 'changed' and variant_xml is not None else overlay_xml(target, changed if variant == 'changed' else baseline)
                    (run / 'overlay.xml').write_bytes(overlay)
                    try:
                        p = subprocess.run([str(exe), '-C', 'configuration.xml'], cwd=run, env=env, capture_output=True, timeout=35, creationflags=0x08000000 if os.name == 'nt' else 0)
                    except subprocess.TimeoutExpired as error:
                        console = (error.stdout or b'') + (error.stderr or b'')
                        (run / 'console.log').write_bytes(console)
                        diagnostics = inspect_native_run(-1, console, run); diagnostics['timedOut'] = True
                        (run / 'native-run-diagnostics.json').write_text(json.dumps(diagnostics, ensure_ascii=False, indent=2), encoding='utf-8')
                        report['runs'].append({'family': family, 'variant': variant, 'region': region, 'exitCode': None, 'workDirectory': str(run), 'timedOut': True})
                        shutil.copytree(run, destination / 'runs' / (family + '-' + variant + '-' + ('target' if region == target['region'] else 'control')), dirs_exist_ok=True)
                        raise
                    (run / 'console.log').write_bytes(p.stdout + p.stderr)
                    diagnostics = inspect_native_run(p.returncode, p.stdout + p.stderr, run)
                    (run / 'native-run-diagnostics.json').write_text(json.dumps(diagnostics, ensure_ascii=False, indent=2), encoding='utf-8')
                    row = {'family': family, 'variant': variant, 'region': region, 'exitCode': p.returncode, 'workDirectory': str(run), 'overlaySHA256': hashlib.sha256(overlay).hexdigest()}; report['runs'].append(row)
                    shutil.copytree(run, destination / 'runs' / (family + '-' + variant + '-' + ('target' if region == target['region'] else 'control')), dirs_exist_ok=True)
                    need(diagnostics['passed'], 'Native run requires attention: ' + name + ' (' + diagnostics['status'] + ')')
                    observed = read_debug(run / 'debug.xml', target, region); observations[(family, variant, region)] = observed; row['snapshots'] = observed
        report['summaries'] = compare(observations, baseline, changed, target['region'], control); report['status'] = 'passed'; report['nativeRuns'] = len(report['runs'])
        capsule = result_bundle(report, frozen_case)
    except Exception as error:
        report['status'] = 'failed'; report['error'] = str(error)
        (destination / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
        raise
    (destination / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    (destination / 'result-bundle.json').write_text(json.dumps(capsule, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8', newline='\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ['gcam-exe', 'java-home', 'out-dir']: parser.add_argument('--' + flag, required=True, type=Path)
    parser.add_argument('--work-root', type=Path, default=Path(tempfile.gettempdir())); parser.add_argument('--case', type=Path); parser.add_argument('--control-region', default='CONTROL')
    args = parser.parse_args()
    try:
        report = run_experiment(args.gcam_exe, args.java_home, args.out_dir, args.work_root, args.case, args.control_region)
        print(json.dumps({'status': report['status'], 'nativeRuns': report['nativeRuns'], 'outDirectory': str(args.out_dir.resolve()), 'testOnly': True, 'fullGCAMChina': False, 'policyEffectEvaluated': False}, ensure_ascii=True))
    except (ValueError, OSError, subprocess.SubprocessError, ET.ParseError, KeyError, TypeError) as error:
        parser.exit(1, 'Experiment did not pass: ' + str(error) + '\n')


if __name__ == '__main__':
    main()
