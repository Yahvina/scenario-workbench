import copy
import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/gcam_positive_output_smoke.py'
spec = importlib.util.spec_from_file_location('positive_output', SCRIPT)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
TARGET = {'region': 'HE', 'sector': 'iron and steel', 'subsector': 'test-process', 'technology': 'test-tech', 'year': 2030, 'input': 'test-electricity', 'unit': 'EJ/Mt'}


def observations():
    result = {}
    for family in ['replacement', 'coexistence']:
        for variant in ['baseline', 'changed']:
            for region in ['HE', 'CONTROL']:
                snapshots = []
                for year in [2030, 2035]:
                    vintage_outputs = [(2030, 1)] if family == 'replacement' and year == 2030 else [(2035, 1)] if family == 'replacement' else [(2021, 1), (2030, 1)] if year == 2030 else [(2030, 1), (2035, 1)]
                    rows = []
                    for vintage, output in vintage_outputs:
                        coefficient = 1.9 if variant == 'changed' and region == 'HE' and vintage == 2030 else 2
                        rows.append({'vintage': vintage, 'outputMt': output, 'energyInputEJ': coefficient * output, 'energyCoefficientEJperMt': coefficient, 'materialInputMt': 3 * output})
                    snapshots.append({'year': year, 'region': region, 'outputMt': sum(r['outputMt'] for r in rows), 'energyInputEJ': sum(r['energyInputEJ'] for r in rows), 'materialInputMt': sum(r['materialInputMt'] for r in rows), 'vintages': rows})
                result[(family, variant, region)] = snapshots
    return result


def debug_xml(snapshots):
    root = ET.Element('scenario')
    for snap in snapshots:
        world = ET.SubElement(root, 'world'); marketplace = ET.SubElement(world, 'Marketplace')
        for good, amount in [('test-electricity', snap['energyInputEJ']), ('synthetic-material', snap['materialInputMt'])]:
            market = ET.SubElement(marketplace, 'market', {'year': str(snap['year'])})
            for tag, value in [('MarketGoodOrFuel', good), ('MarketRegion', snap['region']), ('demand', amount)]: ET.SubElement(market, tag).text = str(value)
        region = ET.SubElement(world, 'region', {'name': snap['region']})
        demand = ET.SubElement(region, 'fixed-final-demand', {'name': 'iron and steel'}); ET.SubElement(demand, 'service').text = str(snap['outputMt'])
        sub = ET.SubElement(ET.SubElement(region, 'supplysector', {'name': 'iron and steel'}), 'subsector', {'name': 'test-process'})
        for row in snap['vintages']:
            tech = ET.SubElement(sub, 'technology', {'name': 'test-tech', 'year': str(row['vintage'])})
            ET.SubElement(ET.SubElement(tech, 'primary-output'), 'output').text = str(row['outputMt'])
            for good, amount, coef in [('test-electricity', row['energyInputEJ'], row['energyCoefficientEJperMt']), ('synthetic-material', row['materialInputMt'], 3)]:
                inp = ET.SubElement(tech, 'minicam-energy-input', {'name': good}); ET.SubElement(inp, 'physical-demand').text = str(amount); ET.SubElement(inp, 'current-coef').text = str(coef)
    return root


class PositiveOutputTests(unittest.TestCase):
    def test_fixtures_are_explicitly_synthetic_with_different_lifetimes_and_demands(self):
        for family, lifetime, service in [('replacement', 5, '1'), ('coexistence', 20, '2')]:
            root = ET.fromstring(module.model_xml(TARGET, 2, 'CONTROL', family))
            self.assertEqual(root.findtext('.//global-technology-database/location-info/technology/period/lifetime'), str(lifetime))
            regions = root.findall('./world/region'); self.assertEqual([r.get('name') for r in regions], ['HE', 'CONTROL'])
            for r in regions:
                self.assertEqual(r.findtext('./fixed-final-demand/service[@year="2030"]'), service)
                self.assertEqual(r.findtext('./demographics/populationMiniCAM/totalPop'), '100')
                self.assertEqual(r.findtext('./nationalAccountContainer/nationalAccount/GDP'), '1000')
                self.assertEqual(len(r.findall('./fixed-final-demand/service')), len(module.YEARS))

    def test_invalid_baselines_units_years_and_overlapping_regions_rejected(self):
        for value in [0, -1, None, True, float('inf'), float('nan'), 10 ** 500]:
            with self.subTest(value=str(value)[:20]), self.assertRaises(ValueError): module.model_xml(TARGET, value, 'CONTROL', 'replacement')
        for target, control in [({**TARGET, 'year': 2035}, 'CONTROL'), ({**TARGET, 'unit': 'Mt/Mt'}, 'CONTROL'), (TARGET, 'HE'), ({**TARGET, 'input': 'synthetic-material'}, 'CONTROL')]:
            with self.assertRaises(ValueError): module.model_xml(target, 2, control, 'replacement')

    def test_support_files_only_use_local_inputs_and_explicit_stop_year(self):
        files = module.support_files('CONTROL')
        config = ET.fromstring(files['configuration.xml'])
        self.assertEqual(config.findtext('./Ints/Value[@name="stop-year"]'), '2035')
        self.assertEqual(config.findtext('./Strings/Value[@name="debug-region"]'), 'CONTROL')
        self.assertEqual([n.text for n in config.findall('./ScenarioComponents/Value')], ['model.xml', 'solver.xml', 'overlay.xml'])

    def test_aggregate_reduction_is_weighted_by_affected_vintage_output(self):
        result = module.compare(observations(), 2, 1.9, 'HE', 'CONTROL')
        find = lambda family, year: next(r for r in result if r['family'] == family and r['region'] == 'HE' and r['year'] == year)
        self.assertAlmostEqual(find('replacement', 2030)['aggregateEnergyReduction'], .05)
        self.assertAlmostEqual(find('replacement', 2035)['aggregateEnergyReduction'], 0)
        self.assertAlmostEqual(find('coexistence', 2030)['aggregateEnergyReduction'], .025)
        self.assertAlmostEqual(find('coexistence', 2035)['aggregateEnergyReduction'], .025)

    def test_wrong_control_other_input_or_vintage_scope_cannot_pass(self):
        for mutate in [
            lambda r: r[('replacement', 'changed', 'CONTROL')][0].update(energyInputEJ=1.9),
            lambda r: r[('coexistence', 'changed', 'HE')][0].update(materialInputMt=99),
            lambda r: r[('coexistence', 'changed', 'HE')][0]['vintages'][0].update(energyCoefficientEJperMt=1.9),
            lambda r: r[('replacement', 'changed', 'HE')][0].update(outputMt=0)
        ]:
            record = observations(); mutate(record)
            with self.assertRaises(ValueError): module.compare(record, 2, 1.9, 'HE', 'CONTROL')

    def test_native_debug_parser_checks_nonzero_output_io_identity_and_market_totals(self):
        snapshots = observations()[('coexistence', 'changed', 'HE')]
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'debug.xml'
            root = debug_xml(snapshots); ET.ElementTree(root).write(file)
            parsed = module.read_debug(file, TARGET, 'HE')
            self.assertAlmostEqual(parsed[0]['energyInputEJ'], 3.9)
            self.assertAlmostEqual(parsed[0]['marketEnergyDemandEJ'], 3.9)
            self.assertEqual(parsed[0]['fixedSteelDemandMt'], 2)
            self.assertEqual(parsed[0]['marketMaterialDemandMt'], 6)
            root.find('.//market/demand').text = '99'; ET.ElementTree(root).write(file)
            with self.assertRaises(ValueError): module.read_debug(file, TARGET, 'HE')
            root = debug_xml(snapshots); root.find('.//technology/minicam-energy-input/physical-demand').text = '99'; ET.ElementTree(root).write(file)
            with self.assertRaises(ValueError): module.read_debug(file, TARGET, 'HE')

    def test_zero_output_or_missing_debug_snapshot_is_not_a_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'debug.xml'
            snap = copy.deepcopy(observations()[('replacement', 'baseline', 'HE')])
            for s in snap:
                s['outputMt'] = s['energyInputEJ'] = s['materialInputMt'] = 0
                for r in s['vintages']: r['outputMt'] = r['energyInputEJ'] = r['materialInputMt'] = 0
            ET.ElementTree(debug_xml(snap)).write(file)
            with self.assertRaises(ValueError): module.read_debug(file, TARGET, 'HE')
            ET.ElementTree(debug_xml(snap[:1])).write(file)
            with self.assertRaises(ValueError): module.read_debug(file, TARGET, 'HE')

    def test_result_bundle_preserves_exact_unicode_and_bom_case_bytes(self):
        case = '\ufeff{"说明":"合成工程假设"}'.encode('utf-8')
        report = {'status': 'passed', 'nativeRuns': 8, 'testOnly': True, 'fullGCAMChina': False, 'policyEffectEvaluated': False, 'researchMappingApproved': False, 'caseCheck': {'valid': True}, 'linkedCaseSHA256': hashlib.sha256(case).hexdigest()}
        bundle = module.result_bundle(report, case)
        self.assertEqual(bundle['caseJson'].encode('utf-8'), case)
        self.assertEqual(bundle['caseSha256'], report['linkedCaseSHA256'])
        self.assertEqual(json.loads(bundle['reportJson']), report)
        self.assertEqual(hashlib.sha256(bundle['reportJson'].encode()).hexdigest(), bundle['reportSha256'])

    def test_result_bundle_rejects_failed_unbound_and_overclaimed_reports(self):
        report = {'status': 'passed', 'nativeRuns': 8, 'testOnly': True, 'fullGCAMChina': False, 'policyEffectEvaluated': False, 'researchMappingApproved': False, 'caseCheck': None}
        self.assertIsNone(module.result_bundle(report)['caseJson'])
        for patch in [{'status': 'failed'}, {'nativeRuns': 7}, {'testOnly': False}, {'policyEffectEvaluated': True}, {'fullGCAMChina': True}, {'researchMappingApproved': True}, {'linkedCaseSHA256': '1' * 64}, {'caseCheck': {'valid': True}}]:
            with self.subTest(patch=patch), self.assertRaises(ValueError): module.result_bundle({**report, **patch})
        with self.assertRaises(ValueError): module.result_bundle(report, b'{}')

    def test_result_bundle_rejects_nonfinite_and_oversize_report(self):
        report = {'status': 'passed', 'nativeRuns': 8, 'testOnly': True, 'fullGCAMChina': False, 'policyEffectEvaluated': False, 'researchMappingApproved': False, 'caseCheck': None}
        for extra in [float('nan'), 'x' * (16 * 1024 * 1024)]:
            with self.assertRaises(ValueError): module.result_bundle({**report, 'extra': extra})


if __name__ == '__main__': unittest.main()
