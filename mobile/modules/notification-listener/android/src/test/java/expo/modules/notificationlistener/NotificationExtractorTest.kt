package expo.modules.notificationlistener

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationExtractorTest {

  @Test
  fun `joins title and big text with newline`() {
    val result =
      NotificationExtractor.buildRawText(
        title =
          "Nhận chuyển khoản từ NGUYEN VAN A",
        text =
          "Nội dung ngắn",
        bigText =
          "Số tiền 5.000 ₫ về Túi Thần Tài.",
        textLines = emptyList(),
      )

    assertEquals(
      """
      Nhận chuyển khoản từ NGUYEN VAN A
      Số tiền 5.000 ₫ về Túi Thần Tài.
      """.trimIndent(),
      result,
    )
  }

  @Test
  fun `prefers big text over regular text`() {
    val result =
      NotificationExtractor.buildRawText(
        title = "Thông báo biến động số dư",
        text = "Nội dung rút gọn",
        bigText =
          "TK 03xxx350|GD: +554,650VND",
        textLines = emptyList(),
      )

    assertEquals(
      """
      Thông báo biến động số dư
      TK 03xxx350|GD: +554,650VND
      """.trimIndent(),
      result,
    )
  }

  @Test
  fun `falls back to regular text when big text is blank`() {
    val result =
      NotificationExtractor.buildRawText(
        title = "Thông báo biến động số dư",
        text =
          "GD: -68,000 VND",
        bigText = "   ",
        textLines = emptyList(),
      )

    assertEquals(
      """
      Thông báo biến động số dư
      GD: -68,000 VND
      """.trimIndent(),
      result,
    )
  }

  @Test
  fun `appends text lines not already in body`() {
    val result =
      NotificationExtractor.buildRawText(
        title = "Giao dịch thành công",
        text = "Số tiền 100.000 VND",
        bigText = null,
        textLines =
          listOf(
            "Số tiền 100.000 VND",
            "Người nhận NGUYEN VAN A",
            "Mã giao dịch FT260001",
          ),
      )

    assertEquals(
      """
      Giao dịch thành công
      Số tiền 100.000 VND
      Người nhận NGUYEN VAN A
      Mã giao dịch FT260001
      """.trimIndent(),
      result,
    )
  }

  @Test
  fun `does not append duplicate text lines`() {
    val result =
      NotificationExtractor.buildRawText(
        title = "Thông báo",
        text =
          "Số tiền +80,000 VND",
        bigText = null,
        textLines =
          listOf(
            "Số tiền +80,000 VND",
            "Số tiền +80,000 VND",
          ),
      )

    assertEquals(
      """
      Thông báo
      Số tiền +80,000 VND
      """.trimIndent(),
      result,
    )
  }

  @Test
  fun `preserves Vietnamese and currency formatting`() {
    val result =
      NotificationExtractor.buildRawText(
        title =
          "Nhận chuyển khoản",
        text =
          "Số tiền +1.822.540 ₫",
        bigText = null,
        textLines =
          listOf(
            "Nội dung: Đã nhận thành công",
          ),
      )

    assertEquals(
      """
      Nhận chuyển khoản
      Số tiền +1.822.540 ₫
      Nội dung: Đã nhận thành công
      """.trimIndent(),
      result,
    )
  }

  @Test
  fun `trims surrounding whitespace`() {
    val result =
      NotificationExtractor.buildRawText(
        title = "  Thông báo  ",
        text = "  Số tiền 5.000 ₫  ",
        bigText = null,
        textLines =
          listOf(
            "  Người gửi NGUYEN VAN A  ",
          ),
      )

    assertEquals(
      """
      Thông báo
      Số tiền 5.000 ₫
      Người gửi NGUYEN VAN A
      """.trimIndent(),
      result,
    )
  }

  @Test
  fun `returns empty string when content is blank`() {
    val result =
      NotificationExtractor.buildRawText(
        title = " ",
        text = " ",
        bigText = null,
        textLines =
          listOf("", "   "),
      )

    assertEquals("", result)
  }
}