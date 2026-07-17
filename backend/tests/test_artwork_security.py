import unittest
from unittest.mock import patch
from urllib.request import Request

from app.services import thumbnails


class ArtworkSecurityTests(unittest.TestCase):
    @staticmethod
    def _address(ip: str, port: int = 443):
        family = thumbnails.socket.AF_INET6 if ":" in ip else thumbnails.socket.AF_INET
        return [(family, thumbnails.socket.SOCK_STREAM, 6, "", (ip, port))]

    def test_redirect_to_private_address_is_rejected_before_follow(self) -> None:
        handler = thumbnails._PublicArtworkRedirectHandler()
        request = Request("https://public.example/cover.jpg")
        with (
            patch.object(
                thumbnails.socket,
                "getaddrinfo",
                return_value=self._address("10.0.0.8", 80),
            ),
            patch.object(
                thumbnails.HTTPRedirectHandler,
                "redirect_request",
                side_effect=AssertionError("private redirect was followed"),
            ) as follow,
            self.assertRaisesRegex(ValueError, "public host"),
        ):
            handler.redirect_request(
                request,
                None,
                302,
                "Found",
                {},
                "http://private.example/internal-cover",
            )
        follow.assert_not_called()

    def test_public_relative_redirect_is_validated_before_follow(self) -> None:
        handler = thumbnails._PublicArtworkRedirectHandler()
        request = Request("https://cdn.example/original.jpg")
        sentinel = object()
        with (
            patch.object(
                thumbnails.socket,
                "getaddrinfo",
                return_value=self._address("8.8.8.8"),
            ) as resolve,
            patch.object(
                thumbnails.HTTPRedirectHandler,
                "redirect_request",
                return_value=sentinel,
            ) as follow,
        ):
            result = handler.redirect_request(
                request,
                None,
                302,
                "Found",
                {},
                "/replacement.jpg",
            )

        self.assertIs(sentinel, result)
        resolve.assert_called_once_with("cdn.example", 443)
        self.assertEqual("https://cdn.example/replacement.jpg", follow.call_args.args[-1])


if __name__ == "__main__":
    unittest.main()
