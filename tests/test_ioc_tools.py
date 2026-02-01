import unittest
from utils.ioc_tools import validate_iocs, IOC, IOCType


class TestValidateIOCs(unittest.TestCase):
    def test_ipv4(self):
        text = "Suspicious IP 192.168.1.1 found"
        iocs = validate_iocs(text)
        self.assertIn(IOC(IOCType.IP, "192.168.1.1"), iocs)

    def test_domain(self):
        text = "Visit example.com for info"
        iocs = validate_iocs(text)
        self.assertIn(IOC(IOCType.DOMAIN, "example.com"), iocs)

    def test_hash(self):
        text = "Hash d41d8cd98f00b204e9800998ecf8427e detected"
        iocs = validate_iocs(text)
        self.assertIn(IOC(IOCType.HASH, "d41d8cd98f00b204e9800998ecf8427e"), iocs)

    def test_url(self):
        text = "http://malicious.example.com/path"
        iocs = validate_iocs(text)
        self.assertIn(IOC(IOCType.URL, "http://malicious.example.com/path"), iocs)

    def test_defanged_ipv4(self):
        text = "Suspicious IP 192[.]168[.]1[.]1 found"
        iocs = validate_iocs(text)
        self.assertIn(IOC(IOCType.IP, "192.168.1.1"), iocs)

    def test_defanged_domain(self):
        text = "Visit example[.]com for info"
        iocs = validate_iocs(text)
        self.assertIn(IOC(IOCType.DOMAIN, "example.com"), iocs)

    def test_defanged_url(self):
        text = "http://malicious[.]example[.]com/path"
        iocs = validate_iocs(text)
        self.assertIn(IOC(IOCType.URL, "http://malicious.example.com/path"), iocs)

    def test_multiple_domains_whitespace(self):
        text = "alpha.com beta.org gamma.net delta.co"
        iocs = validate_iocs(text)
        expected = {
            IOC(IOCType.DOMAIN, "alpha.com"),
            IOC(IOCType.DOMAIN, "beta.org"),
            IOC(IOCType.DOMAIN, "gamma.net"),
            IOC(IOCType.DOMAIN, "delta.co"),
        }
        self.assertEqual(expected, iocs)


if __name__ == "__main__":
    unittest.main()
