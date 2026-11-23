package expo.modules.notificationlistener

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SupportedSourceTest {

  @Test
  fun `maps Vietcombank package exactly`() {
    val result =
      SupportedSource.fromPackageName(
        "com.VCB",
      )

    assertEquals(
      SupportedSource.VIETCOMBANK,
      result,
    )
  }

  @Test
  fun `maps MBBank package exactly`() {
    val result =
      SupportedSource.fromPackageName(
        "com.mbmobile",
      )

    assertEquals(
      SupportedSource.MBBANK,
      result,
    )
  }

  @Test
  fun `maps MoMo package exactly`() {
    val result =
      SupportedSource.fromPackageName(
        "com.mservice.momotransfer",
      )

    assertEquals(
      SupportedSource.MOMO,
      result,
    )
  }

  @Test
  fun `rejects unsupported Techcombank package`() {
    val result =
      SupportedSource.fromPackageName(
        "com.vn.techcombank.bb.app",
      )

    assertNull(result)
  }

  @Test
  fun `package comparison is case sensitive`() {
    assertNull(
      SupportedSource.fromPackageName(
        "com.vcb",
      ),
    )

    assertNull(
      SupportedSource.fromPackageName(
        "COM.MBMOBILE",
      ),
    )
  }

  @Test
  fun `does not trim package name`() {
    val result =
      SupportedSource.fromPackageName(
        " com.VCB ",
      )

    assertNull(result)
  }

  @Test
  fun `rejects empty and null package names`() {
    assertNull(
      SupportedSource.fromPackageName(""),
    )

    assertNull(
      SupportedSource.fromPackageName(null),
    )
  }
}