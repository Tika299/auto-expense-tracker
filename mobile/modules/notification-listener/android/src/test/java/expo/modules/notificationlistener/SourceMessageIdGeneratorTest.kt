package expo.modules.notificationlistener

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class SourceMessageIdGeneratorTest {

  @Test
  fun `generates expected SHA-256 hash`() {
    val result =
      SourceMessageIdGenerator.generate(
        packageName = "com.VCB",
        notificationKey = "notification-key-123",
        postTime = 1793699279000L,
      )

    assertEquals(
      "8f9bd85fc7d93568fea93dd0d5c5e9a06a745491296a877c9e21a5176bb1d2dd",
      result,
    )
  }

  @Test
  fun `returns same ID for same notification`() {
    val first =
      SourceMessageIdGenerator.generate(
        packageName = "com.mbmobile",
        notificationKey = "key-001",
        postTime = 1793699279000L,
      )

    val second =
      SourceMessageIdGenerator.generate(
        packageName = "com.mbmobile",
        notificationKey = "key-001",
        postTime = 1793699279000L,
      )

    assertEquals(first, second)
    assertEquals(64, first.length)
  }

  @Test
  fun `returns different ID when postTime changes`() {
    val first =
      SourceMessageIdGenerator.generate(
        packageName = "com.mservice.momotransfer",
        notificationKey = "key-001",
        postTime = 1793699279000L,
      )

    val second =
      SourceMessageIdGenerator.generate(
        packageName = "com.mservice.momotransfer",
        notificationKey = "key-001",
        postTime = 1793699279001L,
      )

    assertNotEquals(first, second)
  }

  @Test
  fun `returns different ID for different package`() {
    val first =
      SourceMessageIdGenerator.generate(
        packageName = "com.VCB",
        notificationKey = "key-001",
        postTime = 1793699279000L,
      )

    val second =
      SourceMessageIdGenerator.generate(
        packageName = "com.mbmobile",
        notificationKey = "key-001",
        postTime = 1793699279000L,
      )

    assertNotEquals(first, second)
  }
}